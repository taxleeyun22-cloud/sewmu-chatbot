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

interface Deduction {
  code?: string;
  name?: string;
  amount?: number;
}
interface AutoFields {
  calculated_tax?: number | string;
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

/** 삭제 안 된 검토표 조건 (deleted_at NULL 또는 빈문자) */
function notDeleted() {
  const { filings } = schema;
  return or(isNull(filings.deleted_at), eq(filings.deleted_at, ''))!;
}

export const salesTargetsRouter = router({
  /** 검토표 귀속연도 목록 (드롭다운용, 내림차순) */
  years: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { filings } = schema;
    const rows = await db.select({ y: filings.fiscal_year }).from(filings).where(notDeleted());
    const set = new Set<number>();
    rows.forEach((r) => {
      const y = Number(r.y);
      if (Number.isFinite(y) && y > 0) set.add(y);
    });
    return { years: Array.from(set).sort((a, b) => b - a) };
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
        const us = await db
          .select({ id: users.id, real_name: users.real_name, name: users.name, phone: users.phone })
          .from(users)
          .where(inArray(users.id, ids));
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
        const us = await db
          .select({ id: users.id, real_name: users.real_name, name: users.name, phone: users.phone })
          .from(users)
          .where(inArray(users.id, personIds));
        us.forEach((u) =>
          umap.set(u.id, {
            name: (u.real_name || u.name || `#${u.id}`) as string,
            phone: (u.phone as string | null) ?? null,
          }),
        );
      }
      if (bizIds.length) {
        const bs = await db
          .select({ id: businesses.id, company_name: businesses.company_name, ceo_name: businesses.ceo_name })
          .from(businesses)
          .where(inArray(businesses.id, bizIds));
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
});
