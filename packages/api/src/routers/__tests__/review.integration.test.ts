/**
 * Phase Next-Day23 (2026-05-09): review router 통합 테스트.
 *
 * CLAUDE.md "🚨 자동 검증 시스템" 룰 검증:
 * - 신뢰도 보통/낮음 또는 reported=1 + reviewed=0 → pending list 진입
 * - markReviewed → reviewed=1 + reviewed_at 갱신
 * - 신뢰도 강등 시 reviewed=0 + reported=1 자동 (재검증 큐 재투입)
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers } from './helpers';

setupDbMocks();

function seedConversations(rawDb: any) {
  /* 사장님 = id 1 (owner). seed dialog: */
  rawDb.exec(`
    INSERT INTO conversations (id, session_id, user_id, role, content, confidence, reviewed, reported, created_at) VALUES
      (1, 's1', 3, 'user',      '부가세 신고 기한?',         NULL, 0, 0, '2026-05-08T10:00:00Z'),
      (2, 's1', 3, 'assistant', '1/25, 4/25, 7/25, 10/25 [신뢰도: 높음]', '높음', 0, 0, '2026-05-08T10:00:01Z'),
      (3, 's2', 3, 'user',      '환급 조건?',                 NULL, 0, 0, '2026-05-08T11:00:00Z'),
      (4, 's2', 3, 'assistant', '경비 등 잘 챙기세요 [신뢰도: 보통]', '보통', 0, 0, '2026-05-08T11:00:01Z'),
      (5, 's3', 3, 'user',      '잘못 신고하면?',             NULL, 0, 0, '2026-05-08T12:00:00Z'),
      (6, 's3', 3, 'assistant', '대충 답변 [신뢰도: 낮음]',     '낮음', 0, 1, '2026-05-08T12:00:01Z'),
      (7, 's4', 3, 'assistant', '이미 검토 완료',              '높음', 1, 0, '2026-05-07T10:00:00Z')
  `);
}

describe('review router (integration)', () => {
  describe('list', () => {
    it('filter=pending → 신뢰도 보통/낮음 OR reported=1 + reviewed=0', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      const r = await caller.review.list({ filter: 'pending', limit: 50 });
      const ids = r.items.map((i: { id: number }) => i.id).sort();
      // id 4 (보통, reviewed=0), 6 (낮음+reported, reviewed=0). Excludes 2 (높음), 7 (reviewed=1).
      expect(ids).toEqual([4, 6]);
    });

    it('filter=low → only 낮음', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      const r = await caller.review.list({ filter: 'low' });
      const confidences = r.items.map((i: { confidence: string }) => i.confidence);
      expect(confidences.every((c: string) => c === '낮음')).toBe(true);
      expect(r.items).toHaveLength(1);
    });

    it('filter=medium → only 보통', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      const r = await caller.review.list({ filter: 'medium' });
      expect(r.items.every((i: { confidence: string }) => i.confidence === '보통')).toBe(true);
    });

    it('filter=reported → only reported=1', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      const r = await caller.review.list({ filter: 'reported' });
      expect(r.items.every((i: { reported: number }) => i.reported === 1)).toBe(true);
    });

    it('filter=all → 모든 assistant 메시지', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      const r = await caller.review.list({ filter: 'all' });
      expect(r.items.every((i: { id: number }) => [2, 4, 6, 7].includes(i.id))).toBe(true);
    });

    it('JOIN users — user_real_name in result', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      const r = await caller.review.list({ filter: 'all' });
      const messageWithUser = r.items.find((i: { user_id: number }) => i.user_id === 3);
      expect(messageWithUser?.user_real_name).toBe('박승호');
    });

    it('subquery — question 필드 (직전 user 메시지) 포함', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      const r = await caller.review.list({ filter: 'all', limit: 100 });
      const item2 = r.items.find((i: { id: number }) => i.id === 2);
      expect(item2?.question).toBe('부가세 신고 기한?');
      const item6 = r.items.find((i: { id: number }) => i.id === 6);
      expect(item6?.question).toBe('잘못 신고하면?');
    });

    it('staff (non-owner) BLOCKED by ownerProcedure', async () => {
      const { caller } = await makeCaller({
        userId: 2,
        isAdmin: true,
        isOwner: false,
      });
      await expect(caller.review.list({ filter: 'pending' })).rejects.toThrow();
    });
  });

  describe('markReviewed', () => {
    it('sets reviewed=1 + reviewed_at + reviewed_by', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true, userId: 1 });
      seedUsers(rawDb);
      seedConversations(rawDb);

      await caller.review.markReviewed({ id: 4 });

      const r = rawDb.prepare('SELECT * FROM conversations WHERE id = 4').get() as {
        reviewed: number;
        reviewed_at: string;
        reviewed_by: string;
      };
      expect(r.reviewed).toBe(1);
      expect(r.reviewed_at).toBeTruthy();
      expect(r.reviewed_by).toBe('1');
    });
  });

  describe('report', () => {
    it('flips reported=1 + reviewed=0 (재검증 큐 재투입)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      // id=7 was reviewed=1, reported=0 → toggle to need re-review
      await caller.review.report({ id: 7 });

      const r = rawDb.prepare('SELECT reported, reviewed FROM conversations WHERE id = 7').get() as {
        reported: number;
        reviewed: number;
      };
      expect(r.reported).toBe(1);
      expect(r.reviewed).toBe(0);
    });
  });

  describe('setConfidence', () => {
    it('downgrade (낮음) → reviewed=0 + reported=1 자동', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      // id=2 (높음, reviewed=0) → downgrade to 낮음
      await caller.review.setConfidence({ id: 2, confidence: '낮음' });

      const r = rawDb.prepare('SELECT * FROM conversations WHERE id = 2').get() as {
        confidence: string;
        reviewed: number;
        reported: number;
      };
      expect(r.confidence).toBe('낮음');
      expect(r.reviewed).toBe(0);
      expect(r.reported).toBe(1);
    });

    it('upgrade to 높음 → only confidence change (no reset)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      await caller.review.setConfidence({ id: 7, confidence: '높음' });

      const r = rawDb.prepare('SELECT * FROM conversations WHERE id = 7').get() as {
        confidence: string;
        reviewed: number;
        reported: number;
      };
      expect(r.confidence).toBe('높음');
      expect(r.reviewed).toBe(1); // 그대로
      expect(r.reported).toBe(0); // 그대로
    });
  });

  describe('pendingCount', () => {
    it('returns count of items in검증 대기 큐', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedConversations(rawDb);

      const r = await caller.review.pendingCount();
      expect(r.count).toBe(2); // id 4, 6
    });

    it('returns 0 when nothing pending', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      // no seedConversations
      const r = await caller.review.pendingCount();
      expect(r.count).toBe(0);
    });
  });
});
