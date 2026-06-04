/**
 * 영업 타겟 라우터 통합 테스트 (사장님 2026-06-04).
 *
 * - pension: 종소세·산출세액>0·연금공제 없음 필터 + 산출세액 내림차순 + 전화 JOIN
 * - expense: 직원코멘트/reviewer_comment 키워드 매칭 + Person/Business 이름 JOIN
 * - years:   귀속연도 distinct
 * - adminProcedure gate
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setupDbMocks, makeCaller, seedBusiness } from './helpers';

setupDbMocks();

/* filings 1건 insert 헬퍼 */
function insertFiling(
  rawDb: any,
  f: {
    id: number;
    type: string;
    year: number;
    owner_type: string;
    owner_id: number;
    auto_fields?: Record<string, unknown>;
    reviewer_comment?: string | null;
    deleted_at?: string | null;
  },
) {
  rawDb
    .prepare(
      `INSERT INTO filings (id, type, fiscal_year, owner_type, owner_id, auto_fields, reviewer_comment, review_status, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '작성중', ?, '2026-01-01', '2026-01-01')`,
    )
    .run(
      f.id,
      f.type,
      f.year,
      f.owner_type,
      f.owner_id,
      f.auto_fields ? JSON.stringify(f.auto_fields) : null,
      f.reviewer_comment ?? null,
      f.deleted_at ?? null,
    );
}

function insertUser(rawDb: any, u: { id: number; real_name: string; phone?: string }) {
  rawDb
    .prepare(
      `INSERT INTO users (id, name, real_name, phone, approval_status, is_admin, created_at)
       VALUES (?, ?, ?, ?, 'approved_client', 0, '2026-01-01')`,
    )
    .run(u.id, u.real_name, u.real_name, u.phone ?? null);
}

describe('salesTargets router (integration)', () => {
  describe('pension (연금 절세 타겟)', () => {
    it('산출세액>0 & 연금공제 없음만, 산출세액 내림차순 + 전화 포함', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      insertUser(rawDb, { id: 10, real_name: '김부자', phone: '010-1111-1111' });
      insertUser(rawDb, { id: 11, real_name: '이중간', phone: '010-2222-2222' });
      insertUser(rawDb, { id: 12, real_name: '박연금', phone: '010-3333-3333' });
      insertUser(rawDb, { id: 13, real_name: '최영세', phone: '010-4444-4444' });

      // 타겟1: 산출세액 큼, 연금 없음
      insertFiling(rawDb, {
        id: 1, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 10,
        auto_fields: { calculated_tax: 9_000_000, 공제감면: [{ code: '112', name: '중소기업특별세액감면', amount: 100 }] },
      });
      // 타겟2: 산출세액 작음, 연금 없음
      insertFiling(rawDb, {
        id: 2, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 11,
        auto_fields: { calculated_tax: 2_000_000, 공제감면: [] },
      });
      // 제외: 연금공제 있음 (코드)
      insertFiling(rawDb, {
        id: 3, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 12,
        auto_fields: { calculated_tax: 5_000_000, 공제감면: [{ code: 'SOD_59_3_B', name: '연금계좌세액공제(연금저축)', amount: 720_000 }] },
      });
      // 제외: 산출세액 0
      insertFiling(rawDb, {
        id: 4, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 13,
        auto_fields: { calculated_tax: 0, 공제감면: [] },
      });
      // 제외: 법인세 (개인 아님)
      insertFiling(rawDb, {
        id: 5, type: '법인세', year: 2025, owner_type: 'Business', owner_id: 99,
        auto_fields: { calculated_tax: 20_000_000, 공제감면: [] },
      });

      const r = await caller.salesTargets.pension({ year: 2025 });
      expect(r.scanned).toBe(4); // 종소세 4건 (법인 제외)
      expect(r.withTax).toBe(3); // 산출세액>0 = 3 (id 1,2,3)
      expect(r.excludedPension).toBe(1); // 연금 있는 1건
      expect(r.count).toBe(2);
      expect(r.targets.map((t: any) => t.name)).toEqual(['김부자', '이중간']); // 산출세액 desc
      expect(r.targets[0].calculated_tax).toBe(9_000_000);
      expect(r.targets[0].phone).toBe('010-1111-1111');
    });

    it('타겟 90명 초과 — inArray 청크 분할 (prod D1 변수한도 회피)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const N = 95; // SQL_VAR_LIMIT(90) 초과 → 2청크
      for (let k = 0; k < N; k++) {
        const uid = 1000 + k;
        insertUser(rawDb, { id: uid, real_name: `고객${k}`, phone: `010-0000-${String(k).padStart(4, '0')}` });
        insertFiling(rawDb, {
          id: 500 + k, type: '종소세', year: 2025, owner_type: 'Person', owner_id: uid,
          auto_fields: { calculated_tax: 1_000_000 + k, 공제감면: [] },
        });
      }
      const r = await caller.salesTargets.pension({ year: 2025 });
      expect(r.count).toBe(N);
      // 모든 타겟이 이름·전화 정상 매핑 (청크 누락 시 #id fallback 발생)
      expect(r.targets.every((t: any) => /^고객\d+$/.test(t.name))).toBe(true);
      expect(r.targets.every((t: any) => t.phone && t.phone.startsWith('010-'))).toBe(true);
    });

    it('연금공제를 name(연금계좌)으로도 감지', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      insertUser(rawDb, { id: 20, real_name: '연금이름', phone: '010-0000-0000' });
      insertFiling(rawDb, {
        id: 1, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 20,
        auto_fields: { calculated_tax: 1_000_000, 공제감면: [{ code: 'UNKNOWN', name: '연금계좌세액공제(퇴직연금)', amount: 144_000 }] },
      });
      const r = await caller.salesTargets.pension({ year: 2025 });
      expect(r.count).toBe(0);
      expect(r.excludedPension).toBe(1);
    });
  });

  describe('expense (보험 타겟 — 직원코멘트 키워드)', () => {
    it('employee_note / reviewer_comment 키워드 매칭 + 이름 JOIN', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      insertUser(rawDb, { id: 30, real_name: '접대왕', phone: '010-5555-5555' });
      insertUser(rawDb, { id: 31, real_name: '평범이', phone: '010-6666-6666' });
      seedBusiness(rawDb, { id: 200, company_name: '판촉상사', ceo_name: '대표A' });

      // employee_note 매칭
      insertFiling(rawDb, {
        id: 1, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 30,
        auto_fields: { employee_note: '접대비 740만원 / 판촉비 1900만원 계상' },
      });
      // 키워드 없음
      insertFiling(rawDb, {
        id: 2, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 31,
        auto_fields: { employee_note: '특이사항 없음' },
      });
      // reviewer_comment 매칭 (Business)
      insertFiling(rawDb, {
        id: 3, type: '법인세', year: 2025, owner_type: 'Business', owner_id: 200,
        auto_fields: {}, reviewer_comment: '지출결의서 작성 필요',
      });

      const r = await caller.salesTargets.expense({ year: 2025 });
      expect(r.scanned).toBe(3);
      expect(r.count).toBe(2);
      const byName = Object.fromEntries(r.targets.map((t: any) => [t.name, t]));
      expect(byName['접대왕'].keywords).toEqual(expect.arrayContaining(['접대비', '판촉비']));
      expect(byName['접대왕'].phone).toBe('010-5555-5555');
      expect(byName['판촉상사'].keywords).toEqual(['지출결의']);
      expect(byName['판촉상사'].tax_type).toBe('법인세');
    });

    it('커스텀 키워드 지정 시 그것만 매칭', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      insertUser(rawDb, { id: 40, real_name: '가경비씨' });
      insertFiling(rawDb, {
        id: 1, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 40,
        auto_fields: { employee_note: '가경비 5천만원 계상, 접대비 약간' },
      });
      const r = await caller.salesTargets.expense({ year: 2025, keywords: ['가경비'] });
      expect(r.count).toBe(1);
      expect(r.targets[0].keywords).toEqual(['가경비']);
    });
  });

  describe('years', () => {
    it('귀속연도 distinct 내림차순', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      insertFiling(rawDb, { id: 1, type: '종소세', year: 2024, owner_type: 'Person', owner_id: 1 });
      insertFiling(rawDb, { id: 2, type: '종소세', year: 2025, owner_type: 'Person', owner_id: 2 });
      insertFiling(rawDb, { id: 3, type: '법인세', year: 2025, owner_type: 'Business', owner_id: 3 });
      const r = await caller.salesTargets.years();
      expect(r.years).toEqual([2025, 2024]);
    });
  });

  describe('RBAC', () => {
    it('비인증 호출 거부 (adminProcedure)', async () => {
      const { caller } = await makeCaller({ isOwner: false, isAdmin: false, userId: null });
      await expect(caller.salesTargets.pension({ year: 2025 })).rejects.toThrow();
    });
  });
});
