/**
 * 실시간 세션 목록·배지 — 2026-10-02 D1 한도 사고 후:
 *   created_at 을 datetime() 으로 감싸던 비교를 문자열 비교로 바꿔 idx_conv_created 를 타게 했다.
 *   여기서 지키는 것: 30분 안 메시지만 세션으로 잡히고, total_unread 는 30분 안 user 메시지 수.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { onRequestGet } from './admin-live.js';

const KEY = 'test-admin-key';
type AnyDb = ReturnType<typeof createTestDb>['d1'];
let d1: AnyDb;

const kst = (offsetMin: number) => new Date(Date.now() + 9 * 3600e3 + offsetMin * 60e3).toISOString().replace('T', ' ').slice(0, 19);
async function list() {
  const req = { url: 'https://sewmu-chatbot.pages.dev/api/admin-live?key=' + KEY, method: 'GET', headers: { get: () => null } };
  const r = await onRequestGet({ env: { DB: d1, ADMIN_KEY: KEY }, request: req });
  return (await r.json()) as any;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T03:00:00Z'));   // 12:00 KST
  d1 = createTestDb().d1;
  await d1.prepare(`INSERT INTO users (id, name, real_name, is_admin, approval_status) VALUES (1, '이재윤', '이재윤', 1, 'approved_client'), (5, '거래처', '김사장', 0, 'approved_client'), (6, '옛손님', '박옛', 0, 'approved_client')`).run();
  const ins = (session: string, user: number, role: string, at: string) =>
    d1.prepare(`INSERT INTO conversations (session_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'x', ?)`).bind(session, user, role, at).run();
  await ins('s-new', 5, 'user', kst(-5));
  await ins('s-new', 5, 'assistant', kst(-4));
  await ins('s-new', 5, 'user', kst(-1));
  await ins('s-old', 6, 'user', kst(-90));          // 30분 밖
  await ins('s-anon', 0, 'user', kst(-2));          // user_id 0 — 그대로 잡힘 (NOT NULL)
});
afterEach(() => { vi.useRealTimers(); });

describe('admin-live 목록', () => {
  it('30분 안 세션만, 최근순, 미리보기·unread', async () => {
    const d = await list();
    const ids = d.sessions.map((s: any) => s.session_id);
    expect(ids).toContain('s-new');
    expect(ids).not.toContain('s-old');
    const s = d.sessions.find((x: any) => x.session_id === 's-new');
    expect(s).toMatchObject({ user_id: 5, real_name: '김사장', msg_count: 3 });
    expect(s.last_user_message).toBe('x');
    expect(d.total_unread).toBe(3);                 // s-new user 2 + s-anon 1
  });

  it('인덱스가 생긴다 (ensureTables)', async () => {
    await list();
    const idx = await d1.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_conv_created'`).first();
    expect(idx).toBeTruthy();
  });

  it('키 없으면 401', async () => {
    const req = { url: 'https://sewmu-chatbot.pages.dev/api/admin-live', method: 'GET', headers: { get: () => null } };
    const r = await onRequestGet({ env: { DB: d1, ADMIN_KEY: KEY }, request: req });
    expect(r.status).toBe(401);
  });
});
