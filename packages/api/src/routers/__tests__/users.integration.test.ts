/**
 * Phase Next-Day23 (2026-05-09): users router 통합 테스트.
 *
 * CLAUDE.md 룰 검증:
 * - "사용자 권한·Status 자동 변경 절대 금지" → setStatus / setAdmin 정확히 작동
 * - admin 권한 회수는 ownerProcedure (사장님 명시 명령만)
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers } from './helpers';

setupDbMocks();

describe('users router (integration)', () => {
  describe('list', () => {
    it('returns active users excluding soft-deleted / merged', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      // soft-deleted user
      rawDb.exec(`INSERT INTO users (id, name, real_name, approval_status, deleted_at, created_at, last_login_at)
                  VALUES (5, '삭제됨', '삭제됨', 'pending', '2026-04-01T00:00:00Z', '2026-01-01', '2026-04-01')`);

      const r = await caller.users.list({ limit: 50 });
      const ids = r.users.map((u: { id: number }) => u.id).sort();
      expect(ids).toEqual([1, 2, 3, 4]);
      expect(r.users.find((u: { id: number }) => u.id === 5)).toBeUndefined();
    });

    it('filters by status=pending', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.users.list({ status: 'pending', limit: 50 });
      expect(r.users).toHaveLength(1);
      expect(r.users[0].real_name).toBe('홍길동');
    });

    it('filters by status=admin (is_admin=1)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.users.list({ status: 'admin', limit: 50 });
      const realNames = r.users.map((u: { real_name: string }) => u.real_name).sort();
      expect(realNames).toEqual(['김민지', '이재윤']);
    });

    it('search filter LIKE matches real_name / phone / email', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`UPDATE users SET phone='010-1234-5678', email='park@example.com' WHERE id=3`);
      const r = await caller.users.list({ search: '박승호', limit: 50 });
      expect(r.users).toHaveLength(1);
      expect(r.users[0].id).toBe(3);

      const r2 = await caller.users.list({ search: '1234', limit: 50 });
      expect(r2.users.length).toBeGreaterThan(0);
      expect(r2.users.find((u: { id: number }) => u.id === 3)).toBeTruthy();
    });

    it('rejects unauth (adminProcedure)', async () => {
      const { caller } = await makeCaller({
        userId: null,
        isAdmin: false,
        isOwner: false,
      });
      await expect(caller.users.list({})).rejects.toThrow();
    });
  });

  describe('setStatus', () => {
    it('updates approval_status + sets approved_at', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      await caller.users.setStatus({ userId: 4, status: 'approved_client' });

      const u = rawDb.prepare('SELECT * FROM users WHERE id = 4').get() as {
        approval_status: string;
        approved_at: string | null;
      };
      expect(u.approval_status).toBe('approved_client');
      expect(u.approved_at).toBeTruthy();
    });

    it('rejects unknown status (Zod gate)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await expect(
        caller.users.setStatus({ userId: 4, status: 'foo' as never }),
      ).rejects.toThrow();
    });

    it('staff (non-admin) blocked by adminProcedure', async () => {
      const { caller, rawDb } = await makeCaller({
        userId: 3,
        isAdmin: false,
        isOwner: false,
      });
      seedUsers(rawDb);
      await expect(
        caller.users.setStatus({ userId: 4, status: 'rejected' }),
      ).rejects.toThrow();
    });
  });

  describe('setAdmin (CLAUDE.md owner-only 절대 룰)', () => {
    it('owner can grant admin', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      await caller.users.setAdmin({ userId: 3, isAdmin: 1 });

      const u = rawDb.prepare('SELECT is_admin FROM users WHERE id = 3').get() as {
        is_admin: number;
      };
      expect(u.is_admin).toBe(1);
    });

    it('owner can revoke admin', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      await caller.users.setAdmin({ userId: 2, isAdmin: 0 });

      const u = rawDb.prepare('SELECT is_admin FROM users WHERE id = 2').get() as {
        is_admin: number;
      };
      expect(u.is_admin).toBe(0);
    });

    it('admin (non-owner) BLOCKED by ownerProcedure (사장님 결정 2026-05-11)', async () => {
      const { caller, rawDb } = await makeCaller({
        userId: 2,
        isAdmin: true,
        isOwner: false,
      });
      seedUsers(rawDb);
      await expect(
        caller.users.setAdmin({ userId: 3, isAdmin: 1 }),
      ).rejects.toThrow();
    });

    it('customer BLOCKED by ownerProcedure', async () => {
      const { caller, rawDb } = await makeCaller({
        userId: 3,
        isAdmin: false,
        isOwner: false,
      });
      seedUsers(rawDb);
      await expect(
        caller.users.setAdmin({ userId: 4, isAdmin: 1 }),
      ).rejects.toThrow();
    });

    it('rejects isAdmin not in {0,1}', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await expect(
        caller.users.setAdmin({ userId: 3, isAdmin: 2 as never }),
      ).rejects.toThrow();
    });
  });
});
