/**
 * Phase Next-Day23 (2026-05-09): businesses router 통합 테스트.
 *
 * 위하고 호환 14필드 + 본·지점 매핑 + business_members N:N 매핑.
 * CLAUDE.md "사장님 권한 자동 변경 절대 금지" 룰 — delete 는 ownerProcedure.
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers, seedBusiness } from './helpers';

setupDbMocks();

describe('businesses router (integration)', () => {
  describe('list + counts', () => {
    it('returns active businesses + status counts', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 1, company_name: 'A상회', ceo_name: '박사장' });
      seedBusiness(rawDb, { id: 2, company_name: 'B법인' });
      rawDb.exec(`UPDATE businesses SET status = 'closed' WHERE id = 2`);
      seedBusiness(rawDb, { id: 3, company_name: '폐업업체' });
      rawDb.exec(`UPDATE businesses SET status = 'terminated' WHERE id = 3`);
      seedBusiness(rawDb, { id: 4, company_name: '삭제됨' });
      rawDb.exec(`UPDATE businesses SET deleted_at = '2026-04-01T00:00:00Z' WHERE id = 4`);

      const r = await caller.businesses.list({});
      const ids = r.businesses.map((b: { id: number }) => b.id).sort();
      expect(ids).toEqual([1, 2, 3]); // soft-deleted excluded
      expect(r.counts).toEqual({
        all: 3,
        active: 1,
        closed: 1,
        terminated: 1,
      });
    });

    it('search filter (company_name / business_number / ceo_name)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 1, company_name: '온나플러스', ceo_name: '박승호' });
      seedBusiness(rawDb, { id: 2, company_name: 'ABC상회', ceo_name: '김철수' });
      rawDb.exec(`UPDATE businesses SET business_number = '123-45-67890' WHERE id = 1`);

      const r1 = await caller.businesses.list({ search: '온나' });
      expect(r1.businesses).toHaveLength(1);
      expect(r1.businesses[0].id).toBe(1);

      const r2 = await caller.businesses.list({ search: '김철수' });
      expect(r2.businesses).toHaveLength(1);
      expect(r2.businesses[0].id).toBe(2);

      const r3 = await caller.businesses.list({ search: '123-45' });
      expect(r3.businesses).toHaveLength(1);
      expect(r3.businesses[0].id).toBe(1);
    });
  });

  describe('get + branches', () => {
    it('returns business + branches (parent → children)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 1, company_name: '본점' });
      seedBusiness(rawDb, { id: 2, company_name: '지점A' });
      seedBusiness(rawDb, { id: 3, company_name: '지점B' });
      rawDb.exec(`UPDATE businesses SET parent_business_id = 1 WHERE id IN (2, 3)`);

      const r = await caller.businesses.get({ id: 1 });
      expect(r.business?.company_name).toBe('본점');
      expect(r.branches).toHaveLength(2);
      expect(r.parent).toBeNull();
    });

    it('branch returns parent (no branches)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 1, company_name: '본점' });
      seedBusiness(rawDb, { id: 2, company_name: '지점' });
      rawDb.exec(`UPDATE businesses SET parent_business_id = 1 WHERE id = 2`);

      const r = await caller.businesses.get({ id: 2 });
      expect(r.business?.company_name).toBe('지점');
      expect(r.parent?.id).toBe(1);
      expect(r.branches).toEqual([]);
    });

    it('non-existent → all null/empty', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.businesses.get({ id: 99999 });
      expect(r.business).toBeNull();
      expect(r.branches).toEqual([]);
      expect(r.parent).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts business with required fields', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });

      const r = await caller.businesses.create({
        company_name: '신규업체',
        business_number: '111-22-33333',
        ceo_name: '신대표',
        company_form: '1.개인사업자',
      });

      expect(r.id).toBeGreaterThan(0);
      const row = rawDb.prepare('SELECT * FROM businesses WHERE id = ?').get(r.id) as {
        company_name: string;
        status: string;
      };
      expect(row.company_name).toBe('신규업체');
      expect(row.status).toBe('active');
    });

    it('rejects empty company_name', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      await expect(
        caller.businesses.create({ company_name: '' }),
      ).rejects.toThrow();
    });
  });

  describe('update (위하고 14필드)', () => {
    it('patches partial fields', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 1, company_name: '원래이름' });

      await caller.businesses.update({
        id: 1,
        patch: {
          company_name: '바뀐이름',
          ceo_name: '박사장',
          industry: '도소매업',
          fiscal_term: 5,
        },
      });

      const row = rawDb.prepare('SELECT * FROM businesses WHERE id = 1').get() as {
        company_name: string;
        ceo_name: string;
        industry: string;
        fiscal_term: number;
      };
      expect(row.company_name).toBe('바뀐이름');
      expect(row.ceo_name).toBe('박사장');
      expect(row.industry).toBe('도소매업');
      expect(row.fiscal_term).toBe(5);
    });

    it('only specified fields touched (others unchanged)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 1, company_name: 'X' });
      rawDb.exec(`UPDATE businesses SET ceo_name = '원래대표', address = '대구' WHERE id = 1`);

      await caller.businesses.update({
        id: 1,
        patch: { ceo_name: '새대표' },
      });

      const row = rawDb.prepare('SELECT * FROM businesses WHERE id = 1').get() as {
        ceo_name: string;
        address: string;
      };
      expect(row.ceo_name).toBe('새대표');
      expect(row.address).toBe('대구');
    });
  });

  describe('addToUser + byUser (사람 ↔ 업체 N:N)', () => {
    it('links user to business via business_members', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: '온나플러스' });

      await caller.businesses.addToUser({
        user_id: 3,
        business_id: 1,
        is_primary: true,
      });

      const row = rawDb.prepare(
        'SELECT * FROM business_members WHERE user_id = ? AND business_id = ?',
      ).get(3, 1) as { is_primary: number };
      expect(row).toBeTruthy();
      expect(row.is_primary).toBe(1);
    });

    it('idempotent — second addToUser updates instead of duplicate', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });

      await caller.businesses.addToUser({ user_id: 3, business_id: 1, is_primary: false });
      await caller.businesses.addToUser({ user_id: 3, business_id: 1, is_primary: true });

      const rows = rawDb.prepare(
        'SELECT * FROM business_members WHERE user_id = ? AND business_id = ?',
      ).all(3, 1);
      expect(rows).toHaveLength(1);
      expect((rows[0] as { is_primary: number }).is_primary).toBe(1);
    });

    it('byUser returns mapped businesses (is_primary DESC)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: '주업체', ceo_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: '부업체', ceo_name: 'B' });

      await caller.businesses.addToUser({ user_id: 3, business_id: 2, is_primary: false });
      await caller.businesses.addToUser({ user_id: 3, business_id: 1, is_primary: true });

      const r = await caller.businesses.byUser({ user_id: 3 });
      expect(r.businesses).toHaveLength(2);
      expect(r.businesses[0].is_primary).toBe(1); // primary 먼저
      expect(r.businesses[0].company_name).toBe('주업체');
      expect(r.businesses[1].is_primary).toBe(0);
    });

    it('byUser excludes soft-deleted businesses', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: '활성업체' });
      seedBusiness(rawDb, { id: 2, company_name: '삭제됨' });
      rawDb.exec(`UPDATE businesses SET deleted_at = '2026-04-01T00:00:00Z' WHERE id = 2`);

      await caller.businesses.addToUser({ user_id: 3, business_id: 1, is_primary: false });
      await caller.businesses.addToUser({ user_id: 3, business_id: 2, is_primary: false });

      const r = await caller.businesses.byUser({ user_id: 3 });
      expect(r.businesses).toHaveLength(1);
      expect(r.businesses[0].company_name).toBe('활성업체');
    });
  });

  describe('delete (CLAUDE.md owner-only 절대 룰)', () => {
    it('owner soft-deletes business', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 1, company_name: '삭제대상' });

      await caller.businesses.delete({ id: 1 });

      const row = rawDb.prepare('SELECT deleted_at FROM businesses WHERE id = 1').get() as {
        deleted_at: string;
      };
      expect(row.deleted_at).toBeTruthy();
    });

    it('manager BLOCKED by ownerProcedure', async () => {
      const { caller, rawDb } = await makeCaller({
        userId: 2,
        isAdmin: true,
        isOwner: false,
        staffRole: 'manager',
      });
      seedBusiness(rawDb, { id: 1, company_name: 'X' });
      await expect(caller.businesses.delete({ id: 1 })).rejects.toThrow();
    });

    it('staff BLOCKED', async () => {
      const { caller, rawDb } = await makeCaller({
        userId: 2,
        isAdmin: true,
        isOwner: false,
        staffRole: 'staff',
      });
      seedBusiness(rawDb, { id: 1, company_name: 'X' });
      await expect(caller.businesses.delete({ id: 1 })).rejects.toThrow();
    });
  });
});
