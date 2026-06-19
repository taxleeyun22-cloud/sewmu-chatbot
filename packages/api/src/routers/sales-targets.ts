/**
 * 영업 타겟 추출 (사장님 명령 2026-06-04): 검토표 데이터 기반 영업 명단.
 *
 * 미리보기 실측(2025): 연금 타겟 142명 / 보험(직원코멘트 키워드) 37명.
 *
 * - pension: 종소세 검토표 중 산출세액(calculated_tax)>0 & 연금계좌세액공제 없음
 *            → 연금저축/IRP 절세 권유 타겟. 산출세액 큰 순(절세 여력 큰 순).
 *            ⚠️ 연금계좌세액공제는 개인(거주자)만 — 법인 제외. 그래서 종소세만 스캔.
 * - expense: 검토표 직원코멘트(auto_fields.employee_note) + reviewer_comment 에
 *            접대비·지출결의서·경비내역서·가경비·판촉비 등 키워드 있는 거래처 → 보험 권유 타겟.
 * - years:   검토표 귀속연도 목록 (드롭다운).
 *
 * 전부 읽기 전용(query). filings.auto_fields(JSON) 서버측 파싱 + users/businesses JOIN(이름·전화).
 */
import { z } from 'zod';
import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

/* 연금계좌세액공제 카탈로그 코드 (public/filing-tax-credit-catalog.json) */
const PENSION_CODES = ['JTL_91_5', 'SOD_59_3_A', 'SOD_59_3_B', 'JTL_91_18'];
/* 보험 타겟 기본 키워드 — 직원코멘트에서 검색 (사장님 확정 2026-06-04) */
const DEFAULT_EXPENSE_KEYWORDS = ['접대비', '지출결의', '경비내역', '가경비', '판촉비'];

/* 법인전환 영업 (2026-06-19): 개인 종소세 과세표준 기준. 기본 컷오프 = 8,800만(35% 구간부터).
 * 법인세율(2억↓ 9% / 초과 19%)과의 한계세율 격차가 클수록 전환 실익 큼. */
const DEFAULT_INCORP_TAX_BASE = 88_000_000;

/** 2026 종합소득세 누진 한계세율(%) — 과세표준 구간. (소득세법 제55조) */
export function marginalRateByTaxBase(taxBase: number): number {
  const b = Number(taxBase) || 0;
  if (b > 1_000_000_000) return 45;
  if (b > 500_000_000) return 42;
  if (b > 300_000_000) return 40;
  if (b > 150_000_000) return 38;
  if (b > 88_000_000) return 35;
  if (b > 50_000_000) return 24;
  if (b > 14_000_000) return 15;
  return 6;
}

/** 법인전환 영업 우선순위 등급 — 과세표준 한계세율 기준.
 *  S: 5억 초과(42~45%) · A: 1.5억 초과(38~40%) · B: 8,800만 초과(35%) · C: 24%↓(약함). */
export function incorporationGrade(taxBase: number): 'S' | 'A' | 'B' | 'C' {
  const r = marginalRateByTaxBase(taxBase);
  if (r >= 42) return 'S';
  if (r >= 38) return 'A';
  if (r >= 35) return 'B';
  return 'C';
}

interface Deduction {
  code?: string;
  name?: string;
  amount?: number;
}
interface AutoFields {
  calculated_tax?: number | string;
  tax_base?: number | string;
  revenue?: number | string;
  공제감면?: Deduction[];
  deductions?: Deduction[];
  employee_note?: string;
}

function parseAF(s: string | null | undefined): AutoFields {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as AutoFields) : {};
  } catch {
    return {};
  }
}

/* D1/SQLite 변수 한도(100) 회피 — inArray(ids) 를 청크로 분할 조회.
 * 사장님 보고 (2026-06-04 prod 검증): 연금 142명 inArray → "too many SQL variables" 500.
 * 통합테스트(인메모리)는 한도가 높아 못 잡음 → prod 검증에서 발견. */
const SQL_VAR_LIMIT = 90;
async function chunkedIn<T>(ids: number[], run: (chunk: number[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += SQL_VAR_LIMIT) {
    out.push(...(await run(ids.slice(i, i + SQL_VAR_LIMIT))));
  }
  return out;
}

/** 삭제 안 된 검토표 조건 (deleted_at NULL 또는 빈문자) */
function notDeleted() {
  const { filings } = schema;
  return or(isNull(filings.deleted_at), eq(filings.deleted_at, ''))!;
}

export const salesTargetsRouter = router({
  /** 검토표 귀속연도 목록 (드롭다운용, 내림차순) + 기본 선택 연도 */
  years: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { filings } = schema;
    const rows = await db.select({ y: filings.fiscal_year }).from(filings).where(notDeleted());
    const counts = new Map<number, number>();
    rows.forEach((r) => {
      const y = Number(r.y);
      if (Number.isFinite(y) && y > 0) counts.set(y, (counts.get(y) || 0) + 1);
    });
    const years = Array.from(counts.keys()).sort((a, b) => b - a);
    /* 기본 연도 = 검토표 가장 많은 연도. 최신연도(예: 2026)가 1~2건뿐이면 열자마자 빈 화면
     * 되는 것 방지 — 실제 영업 대상 연도로 자동 진입. (사장님 보고 2026-06-04 prod 검증) */
    let defaultYear = years[0] ?? 0;
    let max = -1;
    counts.forEach((c, y) => {
      if (c > max) {
        max = c;
        defaultYear = y;
      }
    });
    return { years, defaultYear };
  }),

  /** 연금 절세 타겟 — 종소세 · 산출세액>0 · 연금계좌공제 없음 */
  pension: adminProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings, users } = schema;
      const rows = await db
        .select()
        .from(filings)
        .where(and(eq(filings.type, '종소세'), eq(filings.fiscal_year, input.year), notDeleted()));

      let withTax = 0;
      let excludedPension = 0;
      const pre: { owner_id: number; filing_id: number; calculated_tax: number }[] = [];
      for (const f of rows) {
        const af = parseAF(f.auto_fields);
        const ct = Number(af.calculated_tax) || 0;
        if (ct <= 0) continue; // 산출세액 미입력/0 → 제외
        withTax++;
        const ded = Array.isArray(af.공제감면)
          ? af.공제감면
          : Array.isArray(af.deductions)
            ? af.deductions
            : [];
        const hasPension = ded.some(
          (d) => (d?.code && PENSION_CODES.includes(d.code)) || /연금계좌/.test(d?.name || ''),
        );
        if (hasPension) {
          excludedPension++;
          continue;
        }
        if (f.owner_type === 'Person' && f.owner_id) {
          pre.push({ owner_id: f.owner_id, filing_id: f.id, calculated_tax: ct });
        }
      }

      /* 이름·전화 JOIN (Person owner = users) */
      const ids = Array.from(new Set(pre.map((p) => p.owner_id)));
      const umap = new Map<number, { name: string; phone: string | null }>();
      if (ids.length) {
        const us = await chunkedIn(ids, (chunk) =>
          db
            .select({ id: users.id, real_name: users.real_name, name: users.name, phone: users.phone })
            .from(users)
            .where(inArray(users.id, chunk)),
        );
        us.forEach((u) =>
          umap.set(u.id, {
            name: (u.real_name || u.name || `#${u.id}`) as string,
            phone: (u.phone as string | null) ?? null,
          }),
        );
      }

      const targets = pre
        .map((p) => ({
          filing_id: p.filing_id,
          user_id: p.owner_id,
          name: umap.get(p.owner_id)?.name || `#${p.owner_id}`,
          phone: umap.get(p.owner_id)?.phone || null,
          calculated_tax: p.calculated_tax,
        }))
        .sort((a, b) => b.calculated_tax - a.calculated_tax);

      return {
        year: input.year,
        scanned: rows.length,
        withTax,
        excludedPension,
        count: targets.length,
        targets,
      };
    }),

  /** 보험 타겟 — 검토표 직원코멘트 키워드 (접대비·지출결의서 등) */
  expense: adminProcedure
    .input(
      z.object({
        year: z.number().int().min(2000).max(2100),
        keywords: z.array(z.string().min(1).max(40)).max(20).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings, users, businesses } = schema;
      const KW = input.keywords?.length ? input.keywords : DEFAULT_EXPENSE_KEYWORDS;
      const rows = await db
        .select()
        .from(filings)
        .where(and(eq(filings.fiscal_year, input.year), notDeleted()));

      let withNote = 0;
      const pre: {
        filing_id: number;
        owner_type: string;
        owner_id: number;
        tax_type: string;
        keywords: string[];
        note: string;
      }[] = [];
      for (const f of rows) {
        const af = parseAF(f.auto_fields);
        const note = `${af.employee_note || ''} ${f.reviewer_comment || ''}`.trim();
        if (note) withNote++;
        const hits = KW.filter((k) => note.includes(k));
        if (!hits.length) continue;
        pre.push({
          filing_id: f.id,
          owner_type: f.owner_type,
          owner_id: f.owner_id,
          tax_type: f.type,
          keywords: hits,
          note: note.replace(/\s+/g, ' ').slice(0, 140),
        });
      }

      /* 이름·전화 JOIN — Person=users, Business=businesses */
      const personIds = Array.from(
        new Set(pre.filter((p) => p.owner_type === 'Person').map((p) => p.owner_id)),
      );
      const bizIds = Array.from(
        new Set(pre.filter((p) => p.owner_type === 'Business').map((p) => p.owner_id)),
      );
      const umap = new Map<number, { name: string; phone: string | null }>();
      const bmap = new Map<number, { name: string; phone: string | null }>();
      if (personIds.length) {
        const us = await chunkedIn(personIds, (chunk) =>
          db
            .select({ id: users.id, real_name: users.real_name, name: users.name, phone: users.phone })
            .from(users)
            .where(inArray(users.id, chunk)),
        );
        us.forEach((u) =>
          umap.set(u.id, {
            name: (u.real_name || u.name || `#${u.id}`) as string,
            phone: (u.phone as string | null) ?? null,
          }),
        );
      }
      if (bizIds.length) {
        const bs = await chunkedIn(bizIds, (chunk) =>
          db
            .select({ id: businesses.id, company_name: businesses.company_name, ceo_name: businesses.ceo_name })
            .from(businesses)
            .where(inArray(businesses.id, chunk)),
        );
        bs.forEach((b) =>
          bmap.set(b.id, { name: (b.company_name || `업체#${b.id}`) as string, phone: null }),
        );
      }

      const targets = pre.map((p) => {
        const info = p.owner_type === 'Person' ? umap.get(p.owner_id) : bmap.get(p.owner_id);
        return {
          filing_id: p.filing_id,
          owner_type: p.owner_type,
          owner_id: p.owner_id,
          tax_type: p.tax_type,
          name: info?.name || `#${p.owner_id}`,
          phone: info?.phone || null,
          keywords: p.keywords,
          note: p.note,
        };
      });

      return { year: input.year, scanned: rows.length, withNote, count: targets.length, keywords: KW, targets };
    }),

  /** 법인전환 타겟 — 개인 종소세 과세표준 상위(한계세율 ↑) → 법인전환 컨설팅 권유.
   *  과세표준 desc 정렬 + 등급(S/A/B). 정밀 절감액은 추정 리스크라 미표시(한계세율만). */
  incorporation: adminProcedure
    .input(
      z.object({
        year: z.number().int().min(2000).max(2100),
        minTaxBase: z.number().int().min(0).max(100_000_000_000).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings, users } = schema;
      const threshold = input.minTaxBase ?? DEFAULT_INCORP_TAX_BASE;
      const rows = await db
        .select()
        .from(filings)
        .where(and(eq(filings.type, '종소세'), eq(filings.fiscal_year, input.year), notDeleted()));

      let withTaxBase = 0;
      const pre: {
        filing_id: number;
        owner_id: number;
        tax_base: number;
        calculated_tax: number;
        revenue: number;
      }[] = [];
      for (const f of rows) {
        const af = parseAF(f.auto_fields);
        const tb = Number(af.tax_base) || 0;
        if (tb <= 0) continue; // 과세표준 미입력 → 판단 불가, 제외
        withTaxBase++;
        if (tb < threshold) continue;
        if (f.owner_type === 'Person' && f.owner_id) {
          pre.push({
            filing_id: f.id,
            owner_id: f.owner_id,
            tax_base: tb,
            calculated_tax: Number(af.calculated_tax) || 0,
            revenue: Number(af.revenue) || 0,
          });
        }
      }

      /* 이름·전화 JOIN (Person owner = users) */
      const ids = Array.from(new Set(pre.map((p) => p.owner_id)));
      const umap = new Map<number, { name: string; phone: string | null }>();
      if (ids.length) {
        const us = await chunkedIn(ids, (chunk) =>
          db
            .select({ id: users.id, real_name: users.real_name, name: users.name, phone: users.phone })
            .from(users)
            .where(inArray(users.id, chunk)),
        );
        us.forEach((u) =>
          umap.set(u.id, {
            name: (u.real_name || u.name || `#${u.id}`) as string,
            phone: (u.phone as string | null) ?? null,
          }),
        );
      }

      const targets = pre
        .map((p) => ({
          filing_id: p.filing_id,
          user_id: p.owner_id,
          name: umap.get(p.owner_id)?.name || `#${p.owner_id}`,
          phone: umap.get(p.owner_id)?.phone || null,
          tax_base: p.tax_base,
          calculated_tax: p.calculated_tax,
          revenue: p.revenue,
          marginal_rate: marginalRateByTaxBase(p.tax_base),
          grade: incorporationGrade(p.tax_base),
        }))
        .sort((a, b) => b.tax_base - a.tax_base);

      return {
        year: input.year,
        scanned: rows.length,
        withTaxBase,
        threshold,
        count: targets.length,
        targets,
      };
    }),
});
