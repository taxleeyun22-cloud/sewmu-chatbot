/**
 * Phase Next-Day24 (2026-05-09): dashboard router 통합 테스트.
 *
 * 사장님 매일 진입 KPI 9건 + recent feed.
 * SQL 우선순위 버그 fix 회귀 검증 (filings deleted_at OR 조건).
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers } from './helpers';

setupDbMocks();

describe('dashboard router (integration)', () => {
  describe('counts', () => {
    it('all 9 KPI fields exist with correct types', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      const r = await caller.dashboard.counts();
      expect(r.pendingUsers).toBeTypeOf('number');
      expect(r.approvedClients).toBeTypeOf('number');
      expect(r.activeRooms).toBeTypeOf('number');
      expect(r.urgentTodos).toBeTypeOf('number');
      expect(r.pendingDocs).toBeTypeOf('number');
      expect(r.reviewPending).toBeTypeOf('number');
      expect(r.filingsInProgress).toBeTypeOf('number');
      expect(r.unreadMessages).toBeTypeOf('number');
      expect(r.errorLogs).toBeTypeOf('number');
    });

    it('pendingUsers counts approval_status=pending users', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb); // includes 1 pending user (id=4)
      const r = await caller.dashboard.counts();
      expect(r.pendingUsers).toBe(1);
    });

    it('approvedClients counts approval_status=approved_client AND is_admin=0 (옛 admin 패턴)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      /* 옛 admin admin-approve.js: counts 는 is_admin=0 만 (admin 은 별도 탭).
       * seedUsers: id=1,2 admin, id=3 박승호 만 거래처. → 1 */
      const r = await caller.dashboard.counts();
      expect(r.approvedClients).toBe(1);
    });

    it('pendingDocs counts pending documents', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`
        INSERT INTO documents (user_id, doc_type, image_key, status, created_at) VALUES
          (3, '영수증', 'k1', 'pending', '2026-05-09'),
          (3, '영수증', 'k2', 'pending', '2026-05-09'),
          (3, '영수증', 'k3', 'approved', '2026-05-09')
      `);
      const r = await caller.dashboard.counts();
      expect(r.pendingDocs).toBe(2);
    });

    it('reviewPending counts assistant messages needing review', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`
        INSERT INTO conversations (role, content, confidence, reviewed, reported, user_id, created_at) VALUES
          ('assistant', '낮음 답변', '낮음', 0, 0, 3, '2026-05-09'),
          ('assistant', '신고됨', '높음', 0, 1, 3, '2026-05-09'),
          ('assistant', '높음 OK', '높음', 0, 0, 3, '2026-05-09'),
          ('assistant', '이미 검토', '낮음', 1, 0, 3, '2026-05-09')
      `);
      const r = await caller.dashboard.counts();
      expect(r.reviewPending).toBe(2);
    });

    it('filingsInProgress counts 작성중 + 결재대기 (regression: SQL precedence fix)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`
        INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, created_at, updated_at) VALUES
          ('종소세', 2025, 'Person', 3, '작성중', '2026-05-09', '2026-05-09'),
          ('종소세', 2024, 'Person', 3, '결재대기', '2026-05-09', '2026-05-09'),
          ('종소세', 2023, 'Person', 3, '보관완료', '2026-05-09', '2026-05-09')
      `);
      // soft-deleted (이전 SQL bug 가 있다면 카운트에 포함됐음)
      rawDb.exec(`
        INSERT INTO filings (type, fiscal_year, owner_type, owner_id, review_status, deleted_at, created_at, updated_at) VALUES
          ('종소세', 2022, 'Person', 3, '작성중', '2026-05-01', '2026-05-09', '2026-05-09')
      `);

      const r = await caller.dashboard.counts();
      expect(r.filingsInProgress).toBe(2); // 작성중 + 결재대기 (보관완료/deleted 제외)
    });

    it('urgentTodos counts due_date within 3 days + not checked', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const next4Days = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

      rawDb.prepare(
        'INSERT INTO memos (content, due_date, is_checked, created_at) VALUES (?, ?, ?, ?)',
      ).run('오늘', today, 0, '2026-05-09');
      rawDb.prepare(
        'INSERT INTO memos (content, due_date, is_checked, created_at) VALUES (?, ?, ?, ?)',
      ).run('내일', tomorrow, 0, '2026-05-09');
      rawDb.prepare(
        'INSERT INTO memos (content, due_date, is_checked, created_at) VALUES (?, ?, ?, ?)',
      ).run('4일후 (제외)', next4Days, 0, '2026-05-09');
      rawDb.prepare(
        'INSERT INTO memos (content, due_date, is_checked, created_at) VALUES (?, ?, ?, ?)',
      ).run('체크됨 (제외)', today, 1, '2026-05-09');

      const r = await caller.dashboard.counts();
      expect(r.urgentTodos).toBe(2);
    });
  });

  describe('recent', () => {
    it('returns 3 arrays — recentMessages / recentUploads / recentMemos', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`INSERT INTO conversations (role, content, user_id, created_at) VALUES ('assistant', 'msg1', 3, '2026-05-09')`);
      rawDb.exec(`INSERT INTO documents (user_id, doc_type, image_key, status, created_at) VALUES (3, '영수증', 'k', 'pending', '2026-05-09')`);
      rawDb.exec(`INSERT INTO memos (content, target_user_id, created_at) VALUES ('memo1', 3, '2026-05-09')`);

      const r = await caller.dashboard.recent();
      expect(r.recentMessages).toHaveLength(1);
      expect(r.recentMessages[0].user_name).toBe('박승호');
      expect(r.recentUploads).toHaveLength(1);
      expect(r.recentUploads[0].user_name).toBe('박승호');
      expect(r.recentMemos).toHaveLength(1);
      expect(r.recentMemos[0].content).toBe('memo1');
    });

    it('limit 10 each', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      for (let i = 0; i < 15; i++) {
        rawDb.prepare(
          `INSERT INTO conversations (role, content, user_id, created_at) VALUES ('assistant', ?, 3, ?)`,
        ).run(`msg ${i}`, `2026-05-${10 - (i % 9)}`);
      }
      const r = await caller.dashboard.recent();
      expect(r.recentMessages).toHaveLength(10);
    });
  });

  describe('daily', () => {
    it('returns chatTrend + docsByCategory', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const today = new Date().toISOString().slice(0, 10);
      rawDb.prepare(
        `INSERT INTO conversations (role, content, user_id, created_at) VALUES ('assistant', 'm', 3, ?)`,
      ).run(today + 'T10:00:00Z');
      rawDb.prepare(
        `INSERT INTO documents (user_id, doc_type, image_key, status, category, amount, approved_at, created_at) VALUES (3, '영수증', 'k', 'approved', '복리후생비', 10000, ?, ?)`,
      ).run(today + 'T10:00:00Z', today + 'T10:00:00Z');

      const r = await caller.dashboard.daily();
      expect(Array.isArray(r.chatTrend)).toBe(true);
      expect(r.chatTrend.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(r.docsByCategory)).toBe(true);
      expect(r.docsByCategory.length).toBeGreaterThanOrEqual(1);
    });
  });
});
