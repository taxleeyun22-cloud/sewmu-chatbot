/**
 * Phase Next-Day23 (2026-05-09): filings router 통합 테스트.
 *
 * in-memory SQLite + 실제 Drizzle SQL 실행.
 * tRPC caller 통해 라우터 호출 → DB 변화 검증.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setupDbMocks, makeCaller } from './helpers';

setupDbMocks();

describe('filings router (integration)', () => {
  describe('create', () => {
    it('inserts filing with sane defaults', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });

      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });

      expect(r.ok).toBe(true);
      expect(r.id).toBeGreaterThan(0);

      const row = rawDb.prepare('SELECT * FROM filings WHERE id = ?').get(r.id);
      expect(row).toMatchObject({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
        author_user_id: 1, // ctx.auth.userId default
      });
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    });

    it('serializes included_business_ids as JSON', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        included_business_ids: [10, 20, 30],
      });
      const row = rawDb.prepare('SELECT * FROM filings WHERE id = ?').get(r.id);
      expect(JSON.parse(row.included_business_ids)).toEqual([10, 20, 30]);
    });

    it('rejects invalid filing type (Zod gate before DB)', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      await expect(
        caller.filings.create({
          type: 'INVALID' as never,
          fiscal_year: 2025,
          owner_type: 'Person',
          owner_id: 1,
        }),
      ).rejects.toThrow();
    });

    it('rejects unauthenticated caller (adminProcedure gate)', async () => {
      const { caller } = await makeCaller({
        isOwner: false,
        isAdmin: false,
        userId: null,
      });
      await expect(
        caller.filings.create({
          type: '종소세',
          fiscal_year: 2025,
          owner_type: 'Person',
          owner_id: 1,
        }),
      ).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('returns all filings for owner_type+owner_id, sorted by fiscal_year desc', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });

      /* 박승호 (Person 7) 의 3년치 + 다른 사람 1건 */
      const now = new Date().toISOString();
      rawDb.prepare(
        `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('종소세', 2023, 'Person', 7, '보관완료', now, now);
      rawDb.prepare(
        `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('종소세', 2024, 'Person', 7, '보관완료', now, now);
      rawDb.prepare(
        `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('종소세', 2025, 'Person', 7, '작성중', now, now);
      rawDb.prepare(
        `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('법인세', 2025, 'Business', 99, '작성중', now, now);

      const r = await caller.filings.list({
        owner_type: 'Person',
        owner_id: 7,
      });

      expect(r.filings).toHaveLength(3);
      expect(r.filings[0].fiscal_year).toBe(2025);
      expect(r.filings[1].fiscal_year).toBe(2024);
      expect(r.filings[2].fiscal_year).toBe(2023);
    });

    it('omits soft-deleted filings', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const now = new Date().toISOString();
      rawDb.prepare(
        `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('종소세', 2025, 'Person', 7, '작성중', '2026-05-09T00:00:00Z', now, now);
      rawDb.prepare(
        `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('종소세', 2024, 'Person', 7, '보관완료', now, now);

      const r = await caller.filings.list({});
      expect(r.filings.every((f: { deleted_at: string | null }) => !f.deleted_at)).toBe(true);
      expect(r.filings).toHaveLength(1);
    });

    it('returns empty when no filings', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.filings.list({});
      expect(r.filings).toEqual([]);
    });
  });

  describe('byId — 작년 Case 자동 참조', () => {
    it('finds previous year filing for same owner+type', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const now = new Date().toISOString();

      const cur = caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });
      const r2024 = rawDb.prepare(
        `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, auto_fields, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      ).get(
        '종소세',
        2024,
        'Person',
        7,
        '보관완료',
        JSON.stringify({ sales_total: '100000' }),
        now,
        now,
      );

      const created = await cur;
      const byId = await caller.filings.byId({ id: created.id });

      expect(byId.filing?.fiscal_year).toBe(2025);
      expect(byId.previous?.id).toBe(r2024.id);
      expect(byId.previous?.fiscal_year).toBe(2024);
      expect(JSON.parse(byId.previous!.auto_fields!)).toEqual({ sales_total: '100000' });
    });

    it('returns previous=null when no prior year', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const cur = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 99,
      });
      const r = await caller.filings.byId({ id: cur.id });
      expect(r.filing?.id).toBe(cur.id);
      expect(r.previous).toBeNull();
    });

    it('returns filing=null + previous=null for non-existent id', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.filings.byId({ id: 999999 });
      expect(r.filing).toBeNull();
      expect(r.previous).toBeNull();
    });

    it('does NOT match different owner type (Person vs Business)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const now = new Date().toISOString();
      const cur = await caller.filings.create({
        type: '법인세',
        fiscal_year: 2025,
        owner_type: 'Business',
        owner_id: 7,
      });
      // Person 의 같은 ID 작년 — 매칭 안 되어야 함
      rawDb.prepare(
        `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('법인세', 2024, 'Person', 7, '보관완료', now, now);

      const r = await caller.filings.byId({ id: cur.id });
      expect(r.previous).toBeNull();
    });
  });

  describe('patchFields (자동 저장)', () => {
    it('updates auto_fields JSON', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });

      await caller.filings.patchFields({
        id: r.id,
        auto_fields: { sales_total: '500000', vat_payable: '50000' },
      });

      const row = rawDb.prepare('SELECT * FROM filings WHERE id = ?').get(r.id);
      expect(JSON.parse(row.auto_fields)).toEqual({
        sales_total: '500000',
        vat_payable: '50000',
      });
    });

    it('updates reviewer_comment independently', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });
      await caller.filings.patchFields({
        id: r.id,
        reviewer_comment: '작년 대비 매출 20% 증가 — 검토 완료',
      });
      const row = rawDb.prepare('SELECT reviewer_comment FROM filings WHERE id = ?').get(r.id);
      expect(row.reviewer_comment).toContain('매출 20%');
    });

    it('updated_at refreshed on patch', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });
      const before = rawDb.prepare('SELECT updated_at FROM filings WHERE id = ?').get(r.id);
      await new Promise((r) => setTimeout(r, 5));
      await caller.filings.patchFields({ id: r.id, auto_fields: { foo: '1' } });
      const after = rawDb.prepare('SELECT updated_at FROM filings WHERE id = ?').get(r.id);
      expect(after.updated_at >= before.updated_at).toBe(true);
    });
  });

  describe('setStatus (결재 흐름)', () => {
    it('작성중 → 결재대기 → 보관완료', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });

      await caller.filings.setStatus({ id: r.id, status: '결재대기' });
      let row = rawDb.prepare('SELECT * FROM filings WHERE id = ?').get(r.id);
      expect(row.review_status).toBe('결재대기');
      expect(row.reviewer_user_id).toBeNull();
      expect(row.reviewed_at).toBeNull();

      await caller.filings.setStatus({ id: r.id, status: '보관완료' });
      row = rawDb.prepare('SELECT * FROM filings WHERE id = ?').get(r.id);
      expect(row.review_status).toBe('보관완료');
      expect(row.reviewer_user_id).toBe(1); // ctx.auth.userId
      expect(row.reviewed_at).toBeTruthy();
    });

    it('rejects invalid status (Zod)', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });
      await expect(
        caller.filings.setStatus({ id: r.id, status: 'unknown' as never }),
      ).rejects.toThrow();
    });
  });

  describe('remove (soft delete)', () => {
    it('sets deleted_at + filing disappears from list', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });
      const beforeList = await caller.filings.list({});
      expect(beforeList.filings).toHaveLength(1);

      await caller.filings.remove({ id: r.id });
      const afterList = await caller.filings.list({});
      expect(afterList.filings).toHaveLength(0);
    });

    it('byId still returns soft-deleted? (currently filtered)', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.filings.create({
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
      });
      await caller.filings.remove({ id: r.id });
      const detail = await caller.filings.byId({ id: r.id });
      expect(detail.filing).toBeNull(); // soft delete 후 byId 조회 X
    });
  });
});
