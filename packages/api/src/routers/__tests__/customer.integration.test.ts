/**
 * Phase Next-Day28 (2026-05-11): customer.dashboard + businessDashboard integration test.
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers, seedBusiness } from './helpers';

setupDbMocks();

describe('customer router (integration)', () => {
  describe('dashboard', () => {
    it('user 없으면 user=null 반환', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.customer.dashboard({ userId: 999 });
      expect(r.user).toBeNull();
      expect(r.mappedBusinesses).toEqual([]);
      expect(r.docCounts).toEqual({});
    });

    it('user 정보 반환', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.customer.dashboard({ userId: 3 });
      expect(r.user).not.toBeNull();
      expect(r.user.real_name).toBe('박승호');
    });

    it('매핑 사업장 (business_members) 반환', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 100, company_name: '박승호 사업장', ceo_name: '박승호' });
      rawDb.exec(
        `INSERT INTO business_members (id, business_id, user_id, role, is_primary, created_at) VALUES (1, 100, 3, 'representative', 1, '2026-04-01')`,
      );
      const r = await caller.customer.dashboard({ userId: 3 });
      expect(r.mappedBusinesses).toHaveLength(1);
      expect(r.mappedBusinesses[0].company_name).toBe('박승호 사업장');
      expect(r.mappedBusinesses[0].is_primary).toBe(1);
    });

    it('docCounts (status별)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`
        INSERT INTO documents (user_id, doc_type, image_key, status, created_at) VALUES
          (3, '영수증', 'k1', 'pending', '2026-05-09'),
          (3, '영수증', 'k2', 'pending', '2026-05-09'),
          (3, '영수증', 'k3', 'approved', '2026-05-09')
      `);
      const r = await caller.customer.dashboard({ userId: 3 });
      expect(r.docCounts.pending).toBe(2);
      expect(r.docCounts.approved).toBe(1);
    });

    it('메모 (target_user_id) 반환', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`
        INSERT INTO memos (id, content, target_user_id, created_at)
        VALUES (1, '박승호 메모', 3, '2026-05-09T00:00:00Z')
      `);
      const r = await caller.customer.dashboard({ userId: 3 });
      expect(r.memos).toHaveLength(1);
      expect(r.memos[0].content).toBe('박승호 메모');
    });

    it('admin 아닌 사용자는 unauth', async () => {
      const { caller } = await makeCaller({ isAdmin: false, isOwner: false, userId: 99 });
      await expect(caller.customer.dashboard({ userId: 3 })).rejects.toThrow();
    });
  });

  describe('businessDashboard', () => {
    it('business 없으면 null 반환', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.customer.businessDashboard({ businessId: 999 });
      expect(r.business).toBeNull();
    });

    it('business + members 반환', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 100, company_name: 'XYZ 회사', ceo_name: '박승호' });
      rawDb.exec(
        `INSERT INTO business_members (id, business_id, user_id, role, is_primary, created_at) VALUES (1, 100, 3, 'representative', 1, '2026-04-01')`,
      );
      const r = await caller.customer.businessDashboard({ businessId: 100 });
      expect(r.business?.company_name).toBe('XYZ 회사');
      expect(r.members).toHaveLength(1);
      expect(r.members[0].real_name).toBe('박승호');
    });

    it('지점 (branches) 반환', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 100, company_name: '본점' });
      seedBusiness(rawDb, { id: 101, company_name: '지점 1' });
      rawDb.exec(`UPDATE businesses SET parent_business_id = 100 WHERE id = 101`);
      const r = await caller.customer.businessDashboard({ businessId: 100 });
      expect(r.branches).toHaveLength(1);
      expect(r.branches[0].company_name).toBe('지점 1');
    });

    it('business 메모 (target_business_id)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 100, company_name: 'XYZ' });
      rawDb.exec(`
        INSERT INTO memos (id, content, target_business_id, created_at)
        VALUES (1, 'XYZ 메모', 100, '2026-05-09')
      `);
      const r = await caller.customer.businessDashboard({ businessId: 100 });
      expect(r.memos).toHaveLength(1);
      expect(r.memos[0].content).toBe('XYZ 메모');
    });
  });
});
