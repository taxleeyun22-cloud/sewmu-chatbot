/**
 * Phase Next-Day27 (2026-05-11): Audit log 자동 기록 검증.
 *
 * CLAUDE.md "사장님 권한 자동 변경 절대 금지" + 산업 표준 (Stripe/Notion).
 * 모든 권한 변경 / owner-only 액션은 audit_logs 에 자동 INSERT.
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers, seedBusiness } from './helpers';

setupDbMocks();

describe('audit log 자동 기록 (사장님 결정 2026-05-11)', () => {
  describe('users.setAdmin (owner-only)', () => {
    it('owner 가 admin 권한 부여 시 audit 자동 기록', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true, userId: 1 });
      seedUsers(rawDb);

      await caller.users.setAdmin({ userId: 3, isAdmin: 1 });

      const logs = rawDb.prepare('SELECT * FROM audit_logs').all() as Array<{
        actor_user_id: number;
        actor_role: string;
        action: string;
        target_type: string;
        target_id: number;
        before: string;
        after: string;
        result: string;
      }>;
      expect(logs).toHaveLength(1);
      expect(logs[0].actor_user_id).toBe(1);
      expect(logs[0].actor_role).toBe('owner');
      expect(logs[0].action).toBe('admin:user:set_admin');
      expect(logs[0].target_type).toBe('user');
      expect(logs[0].target_id).toBe(3);
      expect(JSON.parse(logs[0].after)).toEqual({ is_admin: 1 });
      expect(logs[0].result).toBe('success');
    });

    it('admin 회수 시에도 before/after 정확 기록', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      // user_id=2 는 이미 is_admin=1 (seedUsers)
      await caller.users.setAdmin({ userId: 2, isAdmin: 0 });

      const log = rawDb.prepare('SELECT * FROM audit_logs WHERE target_id = 2').get() as {
        before: string;
        after: string;
      };
      expect(JSON.parse(log.before)).toEqual({ is_admin: 1 });
      expect(JSON.parse(log.after)).toEqual({ is_admin: 0 });
    });
  });

  describe('users.setStatus (admin OK)', () => {
    it('admin 이 사용자 승인 시 audit 자동 기록', async () => {
      const { caller, rawDb } = await makeCaller({ isAdmin: true, userId: 2 });
      seedUsers(rawDb);

      await caller.users.setStatus({ userId: 4, status: 'approved_client' });

      const logs = rawDb.prepare('SELECT * FROM audit_logs WHERE action = ?').all(
        'admin:user:approve',
      ) as Array<{ actor_role: string; before: string; after: string }>;
      expect(logs).toHaveLength(1);
      expect(logs[0].actor_role).toBe('admin');
      expect(JSON.parse(logs[0].before)).toEqual({ approval_status: 'pending' });
      expect(JSON.parse(logs[0].after)).toEqual({ approval_status: 'approved_client' });
    });
  });

  describe('businesses.delete (owner-only)', () => {
    it('업체 삭제 시 audit 자동 + company_name 보존', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedBusiness(rawDb, { id: 1, company_name: '온나플러스' });

      await caller.businesses.delete({ id: 1 });

      const log = rawDb.prepare('SELECT * FROM audit_logs WHERE action = ?').get(
        'admin:business:delete',
      ) as { target_id: number; before: string };
      expect(log.target_id).toBe(1);
      expect(JSON.parse(log.before)).toEqual({ company_name: '온나플러스' });
    });
  });

  describe('auditLogs.list (owner-only 조회)', () => {
    it('owner 가 audit list 조회 가능', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });

      await caller.users.setStatus({ userId: 4, status: 'approved_client' });
      await caller.businesses.delete({ id: 1 });

      const r = await caller.auditLogs.list({ days: 7 });
      expect(r.logs.length).toBeGreaterThanOrEqual(2);
    });

    it('admin (non-owner) BLOCKED from list', async () => {
      const { caller, rawDb } = await makeCaller({ isAdmin: true });
      seedUsers(rawDb);
      await expect(caller.auditLogs.list({ days: 7 })).rejects.toThrow();
    });

    it('action prefix filter', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });

      await caller.users.setStatus({ userId: 4, status: 'approved_client' });
      await caller.businesses.delete({ id: 1 });

      const r = await caller.auditLogs.list({ days: 7, action: 'admin:user' });
      expect(r.logs.every((l: { action: string }) => l.action.startsWith('admin:user'))).toBe(true);
    });
  });

  describe('auditLogs.byTarget (특정 사용자/업체 history)', () => {
    it('returns full history of target', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      // user_id=3 권한 변경 흐름
      await caller.users.setStatus({ userId: 3, status: 'rejected' });
      await caller.users.setStatus({ userId: 3, status: 'approved_client' });

      const r = await caller.auditLogs.byTarget({ target_type: 'user', target_id: 3 });
      expect(r.logs).toHaveLength(2);
    });
  });

  describe('auditLogs.byActor (직원별 활동량)', () => {
    it('aggregates count per actor + JOIN user real_name', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true, userId: 1 });
      seedUsers(rawDb);

      await caller.users.setStatus({ userId: 4, status: 'approved_client' });

      const r = await caller.auditLogs.byActor({ days: 7 });
      expect(r.actors.length).toBeGreaterThanOrEqual(1);
      expect(r.actors[0].actor_user_id).toBe(1);
      expect(r.actors[0].actor_name).toBe('이재윤');
      expect(r.actors[0].action_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('audit graceful failure (mutation 영향 X)', () => {
    it('비로그인 호출은 audit 안 함', async () => {
      const { caller, rawDb } = await makeCaller({ userId: null });
      seedUsers(rawDb);

      try {
        await caller.users.setStatus({ userId: 4, status: 'approved_client' });
      } catch {
        /* 인증 차단 — 예상 */
      }

      const logs = rawDb.prepare('SELECT COUNT(*) AS c FROM audit_logs').get() as { c: number };
      expect(logs.c).toBe(0);
    });
  });
});
