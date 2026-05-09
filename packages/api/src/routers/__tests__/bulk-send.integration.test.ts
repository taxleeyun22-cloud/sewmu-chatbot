/**
 * Phase Next-Day24 (2026-05-09): bulk-send router 통합 테스트.
 *
 * Kakao 알림톡 fetch mock + 권한 게이트 검증.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers } from './helpers';

setupDbMocks();

describe('bulk-send router (integration)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  describe('preview', () => {
    it('returns approved_client recipients', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`UPDATE users SET phone = '010-1111-1111' WHERE id = 1`);
      rawDb.exec(`UPDATE users SET phone = '010-2222-2222' WHERE id = 2`);
      rawDb.exec(`UPDATE users SET phone = '010-3333-3333' WHERE id = 3`);

      const r = await caller.bulkSend.preview({ target: 'approved_client' });
      expect(r.recipients).toHaveLength(3); // 1, 2, 3 are approved_client
      expect(r.valid_phone).toBe(3);
      expect(r.no_phone).toBe(0);
    });

    it('counts no_phone separately', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`UPDATE users SET phone = '010-1111-1111' WHERE id = 1`);
      // id 2, 3 phone = NULL

      const r = await caller.bulkSend.preview({ target: 'approved_client' });
      expect(r.total).toBe(3);
      expect(r.valid_phone).toBe(1);
      expect(r.no_phone).toBe(2);
    });

    it('target=specific filters by user_ids', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`UPDATE users SET phone = '010-1111-1111' WHERE id IN (1, 2, 3)`);

      const r = await caller.bulkSend.preview({
        target: 'specific',
        user_ids: [1, 3],
      });
      expect(r.recipients).toHaveLength(2);
      const ids = r.recipients.map((u: { id: number }) => u.id).sort();
      expect(ids).toEqual([1, 3]);
    });

    it('target=pending', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`UPDATE users SET phone = '010-1111-1111' WHERE id = 4`);

      const r = await caller.bulkSend.preview({ target: 'pending' });
      expect(r.recipients).toHaveLength(1);
      expect(r.recipients[0].id).toBe(4);
    });

    it('staff (non-manager) BLOCKED — admin:bulk_send is manager+', async () => {
      const { caller, rawDb } = await makeCaller({
        userId: 2,
        isAdmin: true,
        isOwner: false,
        staffRole: 'staff',
      });
      seedUsers(rawDb);
      await expect(
        caller.bulkSend.preview({ target: 'approved_client' }),
      ).rejects.toThrow();
    });

    it('manager allowed', async () => {
      const { caller, rawDb } = await makeCaller({
        userId: 2,
        isAdmin: true,
        isOwner: false,
        staffRole: 'manager',
      });
      seedUsers(rawDb);
      const r = await caller.bulkSend.preview({ target: 'approved_client' });
      expect(r).toBeDefined();
    });
  });

  describe('send', () => {
    it('returns ok=false when env missing', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`UPDATE users SET phone = '010-1111-1111' WHERE id = 3`);

      const r = await caller.bulkSend.send({
        target: 'specific',
        user_ids: [3],
        template_code: 'T1',
        message: '테스트',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('KAKAO_BIZ_API_KEY');
    });

    it('rejects empty message', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      await expect(
        caller.bulkSend.send({
          target: 'all',
          template_code: 'T',
          message: '',
        }),
      ).rejects.toThrow();
    });

    it('rejects message over 2000 chars', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      await expect(
        caller.bulkSend.send({
          target: 'all',
          template_code: 'T',
          message: 'a'.repeat(2001),
        }),
      ).rejects.toThrow();
    });
  });
});
