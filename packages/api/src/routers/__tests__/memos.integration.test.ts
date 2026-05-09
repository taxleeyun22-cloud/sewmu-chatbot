/**
 * Phase Next-Day24 (2026-05-09): memos router 통합 테스트.
 *
 * 사장님 매일 메모 워크플로 — 거래처 정보 / 할 일 / 휴지통.
 * 3가지 scope: customer_all (거래처) / business_all (업체) / room_full (담당자 내부).
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers, seedBusiness } from './helpers';

setupDbMocks();

describe('memos router (integration)', () => {
  describe('create + list (my scope)', () => {
    it('creates memo + my scope returns assigned memos', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true, userId: 1 });
      seedUsers(rawDb);

      // 사장님 본인에게 assigned 한 todo
      rawDb.exec(`
        INSERT INTO memos (assigned_to_user_id, content, category, created_at)
        VALUES (1, '5월 종소세 마감 체크', '할 일', '2026-05-09T00:00:00Z')
      `);

      const r = await caller.memos.list({ scope: 'my' });
      expect(r.memos).toHaveLength(1);
      expect(r.memos[0].content).toContain('종소세');
    });

    it('create memo with target_user_id', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      const r = await caller.memos.create({
        content: '박승호 거래처 주의사항',
        target_user_id: 3,
        category: '거래처 정보',
      });
      expect(r.ok).toBe(true);

      const row = rawDb.prepare('SELECT * FROM memos WHERE id = ?').get(r.id) as {
        content: string;
        target_user_id: number;
        category: string;
      };
      expect(row.target_user_id).toBe(3);
      expect(row.category).toBe('거래처 정보');
    });

    it('create with tags JSON', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      const r = await caller.memos.create({
        content: '#부가세 신고',
        target_user_id: 3,
        tags: ['부가세', '1기예정'],
      });
      const row = rawDb.prepare('SELECT tags FROM memos WHERE id = ?').get(r.id) as {
        tags: string;
      };
      expect(JSON.parse(row.tags)).toEqual(['부가세', '1기예정']);
    });

    it('rejects invalid category (Zod)', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      await expect(
        caller.memos.create({ content: 'x', category: 'unknown' as never }),
      ).rejects.toThrow();
    });

    it('rejects bad due_date format', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      await expect(
        caller.memos.create({ content: 'x', due_date: '2026/05/09' as never }),
      ).rejects.toThrow();
    });
  });

  describe('list scopes', () => {
    it('customer_all returns memos for target_user_id', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.memos.create({ content: '메모1', target_user_id: 3 });
      await caller.memos.create({ content: '다른사람 메모', target_user_id: 4 });

      const r = await caller.memos.list({ scope: 'customer_all', user_id: 3 });
      expect(r.memos).toHaveLength(1);
      expect(r.memos[0].content).toBe('메모1');
    });

    it('business_all returns memos for target_business_id', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });
      await caller.memos.create({ content: 'A 메모', target_business_id: 1 });
      await caller.memos.create({ content: 'B 메모', target_business_id: 2 });

      const r = await caller.memos.list({ scope: 'business_all', business_id: 1 });
      expect(r.memos).toHaveLength(1);
      expect(r.memos[0].content).toBe('A 메모');
    });

    it('room_full returns memos for room_id', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.memos.create({ content: '담당자 내부', room_id: 'ABC123' });

      const r = await caller.memos.list({ scope: 'room_full', room_id: 'ABC123' });
      expect(r.memos).toHaveLength(1);
    });

    it('trash_list returns deleted memos', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const created = await caller.memos.create({ content: '삭제 예정', target_user_id: 3 });
      await caller.memos.delete({ id: created.id });

      const r = await caller.memos.list({ scope: 'trash_list' });
      expect(r.memos.length).toBeGreaterThanOrEqual(1);
      expect(r.memos.find((m: { id: number }) => m.id === created.id)).toBeTruthy();
    });
  });

  describe('list filters (category / tag)', () => {
    it('category filter applies', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.memos.create({ content: '전화', target_user_id: 3, category: '전화' });
      await caller.memos.create({ content: '약속', target_user_id: 3, category: '약속' });

      const r = await caller.memos.list({
        scope: 'customer_all',
        user_id: 3,
        category: '전화',
      });
      expect(r.memos).toHaveLength(1);
      expect(r.memos[0].category).toBe('전화');
    });

    it('tag filter LIKE %"tag"%', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.memos.create({ content: 'a', target_user_id: 3, tags: ['부가세'] });
      await caller.memos.create({ content: 'b', target_user_id: 3, tags: ['종소세'] });

      const r = await caller.memos.list({
        scope: 'customer_all',
        user_id: 3,
        tag: '부가세',
      });
      expect(r.memos).toHaveLength(1);
    });
  });

  describe('update / delete / restore / purge', () => {
    it('update patches partial fields', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.memos.create({ content: '원본', target_user_id: 3 });

      await caller.memos.update({
        id: r.id,
        patch: { content: '수정', is_checked: 1 },
      });

      const row = rawDb.prepare('SELECT * FROM memos WHERE id = ?').get(r.id) as {
        content: string;
        is_checked: number;
      };
      expect(row.content).toBe('수정');
      expect(row.is_checked).toBe(1);
    });

    it('delete soft-deletes (deleted_at)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.memos.create({ content: 'x', target_user_id: 3 });

      await caller.memos.delete({ id: r.id });

      const row = rawDb.prepare('SELECT deleted_at FROM memos WHERE id = ?').get(r.id) as {
        deleted_at: string;
      };
      expect(row.deleted_at).toBeTruthy();
    });

    it('restore clears deleted_at', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.memos.create({ content: 'x', target_user_id: 3 });
      await caller.memos.delete({ id: r.id });
      await caller.memos.restore({ id: r.id });

      const row = rawDb.prepare('SELECT deleted_at FROM memos WHERE id = ?').get(r.id) as {
        deleted_at: string | null;
      };
      expect(row.deleted_at).toBeNull();
    });

    it('purge actually removes row', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.memos.create({ content: 'x', target_user_id: 3 });

      await caller.memos.purge({ id: r.id });

      const row = rawDb.prepare('SELECT * FROM memos WHERE id = ?').get(r.id);
      expect(row).toBeUndefined();
    });
  });
});
