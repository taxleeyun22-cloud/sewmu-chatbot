/**
 * Phase Next-Day26 (2026-05-09): error_logs router 통합 테스트.
 *
 * CLAUDE.md "🐞 옵션 A 룰" 검증:
 * - log: publicProcedure (누구나 호출)
 * - 가짜 source 차단 ('verify', 'test', '__test__' 등)
 * - 7일 이내 무당벌레 카운트
 * - resolve / clearOld / clearAll = ownerProcedure
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers } from './helpers';

setupDbMocks();

describe('error_logs router (integration)', () => {
  describe('log (public)', () => {
    it('saves error log when source is whitelisted', async () => {
      const { caller, rawDb } = await makeCaller({ userId: null });
      const r = await caller.errorLogs.log({
        source: 'admin',
        message: 'TypeError: Cannot read property foo',
        stack: 'at line 123',
        url: 'https://sewmu-chatbot.pages.dev/admin.html',
      });
      expect(r.ok).toBe(true);

      const rows = rawDb.prepare('SELECT * FROM error_logs').all() as Array<{
        source: string;
        message: string;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].source).toBe('admin');
      expect(rows[0].message).toContain('TypeError');
    });

    it('captures user_id when authenticated', async () => {
      const { caller, rawDb } = await makeCaller({ userId: 3 });
      seedUsers(rawDb);
      await caller.errorLogs.log({
        source: 'customer',
        message: 'oops',
      });
      const row = rawDb.prepare('SELECT user_id FROM error_logs').get() as {
        user_id: number;
      };
      expect(row.user_id).toBe(3);
    });

    it('rejects fake sources (CLAUDE.md prod 검증 룰)', async () => {
      const { caller } = await makeCaller({ userId: null });
      const fakes = ['verify', 'verification', 'test', '__test__', 'fake', 'evil'];
      for (const source of fakes) {
        const r = await caller.errorLogs.log({
          source,
          message: 'should not reach DB',
        });
        expect(r.ok).toBe(false);
      }
    });

    it('rejects message over 2000 chars (DoS guard)', async () => {
      const { caller } = await makeCaller({ userId: null });
      await expect(
        caller.errorLogs.log({
          source: 'admin',
          message: 'a'.repeat(2001),
        }),
      ).rejects.toThrow();
    });

    it('rejects stack over 4000 chars', async () => {
      const { caller } = await makeCaller({ userId: null });
      await expect(
        caller.errorLogs.log({
          source: 'admin',
          message: 'x',
          stack: 'a'.repeat(4001),
        }),
      ).rejects.toThrow();
    });

    it('serializes context as JSON', async () => {
      const { caller, rawDb } = await makeCaller({ userId: null });
      await caller.errorLogs.log({
        source: 'admin',
        message: 'error',
        context: { component: 'UserList', userId: 5 },
      });
      const row = rawDb.prepare('SELECT context FROM error_logs').get() as {
        context: string;
      };
      expect(JSON.parse(row.context)).toEqual({ component: 'UserList', userId: 5 });
    });
  });

  describe('recentCount (owner-only)', () => {
    it('counts unresolved errors within 7 days', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.errorLogs.log({ source: 'admin', message: 'e1' });
      await caller.errorLogs.log({ source: 'admin', message: 'e2' });
      await caller.errorLogs.log({ source: 'customer', message: 'e3' });

      const r = await caller.errorLogs.recentCount();
      expect(r.count).toBe(3);
    });

    it('excludes resolved errors', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.errorLogs.log({ source: 'admin', message: 'e1' });
      await caller.errorLogs.log({ source: 'admin', message: 'e2' });
      const r1 = rawDb.prepare('SELECT id FROM error_logs ORDER BY id LIMIT 1').get() as {
        id: number;
      };
      await caller.errorLogs.resolve({ id: r1.id });

      const r = await caller.errorLogs.recentCount();
      expect(r.count).toBe(1);
    });

    it('excludes errors older than 7 days', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const old = new Date(Date.now() - 10 * 86400000).toISOString();
      rawDb.prepare(
        `INSERT INTO error_logs (source, message, created_at) VALUES ('admin', 'old', ?)`,
      ).run(old);
      await caller.errorLogs.log({ source: 'admin', message: 'recent' });

      const r = await caller.errorLogs.recentCount();
      expect(r.count).toBe(1);
    });

    it('non-owner BLOCKED', async () => {
      const { caller } = await makeCaller({ userId: 2, isAdmin: true });
      await expect(caller.errorLogs.recentCount()).rejects.toThrow();
    });
  });

  describe('list (owner-only)', () => {
    it('returns ordered list (most recent first)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.errorLogs.log({ source: 'admin', message: 'first' });
      await new Promise((r) => setTimeout(r, 10));
      await caller.errorLogs.log({ source: 'admin', message: 'second' });

      const r = await caller.errorLogs.list({ days: 7 });
      expect(r.errors).toHaveLength(2);
      expect(r.errors[0].message).toBe('second');
    });

    it('filter by resolved=false', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.errorLogs.log({ source: 'admin', message: 'e1' });
      const r1 = rawDb.prepare('SELECT id FROM error_logs LIMIT 1').get() as {
        id: number;
      };
      await caller.errorLogs.resolve({ id: r1.id });
      await caller.errorLogs.log({ source: 'admin', message: 'e2' });

      const r = await caller.errorLogs.list({ days: 7, resolved: false });
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].message).toBe('e2');
    });

    it('filter by source', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.errorLogs.log({ source: 'admin', message: 'a' });
      await caller.errorLogs.log({ source: 'customer', message: 'b' });

      const r = await caller.errorLogs.list({ days: 7, source: 'customer' });
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].source).toBe('customer');
    });
  });

  describe('resolve / clear', () => {
    it('resolve marks resolved=1 + resolved_at + resolved_by', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true, userId: 1 });
      seedUsers(rawDb);
      await caller.errorLogs.log({ source: 'admin', message: 'e' });
      const id = (rawDb.prepare('SELECT id FROM error_logs LIMIT 1').get() as { id: number }).id;

      await caller.errorLogs.resolve({ id });

      const row = rawDb.prepare('SELECT * FROM error_logs WHERE id = ?').get(id) as {
        resolved: number;
        resolved_at: string;
        resolved_by: number;
      };
      expect(row.resolved).toBe(1);
      expect(row.resolved_at).toBeTruthy();
      expect(row.resolved_by).toBe(1);
    });

    it('clearOld deletes older than N days', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const old = new Date(Date.now() - 10 * 86400000).toISOString();
      const recent = new Date().toISOString();
      rawDb.prepare(
        `INSERT INTO error_logs (source, message, created_at) VALUES ('admin', 'old', ?)`,
      ).run(old);
      rawDb.prepare(
        `INSERT INTO error_logs (source, message, created_at) VALUES ('admin', 'recent', ?)`,
      ).run(recent);

      const r = await caller.errorLogs.clearOld({ days: 7 });
      expect(r.deleted).toBe(1);

      const remaining = rawDb.prepare('SELECT COUNT(*) AS c FROM error_logs').get() as {
        c: number;
      };
      expect(remaining.c).toBe(1);
    });

    it('clearAll deletes everything (owner-only nuclear)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.errorLogs.log({ source: 'admin', message: 'e1' });
      await caller.errorLogs.log({ source: 'admin', message: 'e2' });

      await caller.errorLogs.clearAll();
      const remaining = rawDb.prepare('SELECT COUNT(*) AS c FROM error_logs').get() as {
        c: number;
      };
      expect(remaining.c).toBe(0);
    });

    it('manager BLOCKED from clearAll', async () => {
      const { caller } = await makeCaller({
        userId: 2,
        isAdmin: true,
        isOwner: false,
        staffRole: 'manager',
      });
      await expect(caller.errorLogs.clearAll()).rejects.toThrow();
    });
  });
});
