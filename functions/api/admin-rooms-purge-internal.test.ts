/**
 * 🔐 관리자방 영구삭제 — 2026-10-01 사장님: "관리자방 영구삭제하자 채팅을 여기서 안할거니까"
 *
 * 실제 엔드포인트(admin-rooms.js purge_internal)를 SQLite(D1 호환)에 붙여 돌린다.
 * 여기서 지키는 것:
 *  1. confirm 없이는 건수만 세고 아무것도 안 지운다 (dry-run)
 *  2. 사장님만 (직원 403)
 *  3. 지울 때 외부 상담방은 손도 안 댄다
 *  4. R2 첨부는 관리자방에서만 쓰는 키만 지운다 — 다른 방 메시지가 같은 키를 쓰면 남긴다
 *  5. 두 번 눌러도 안전 (남은 게 없으면 rooms:0)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { onRequestPost } from './admin-rooms.js';

const KEY = 'test-admin-key';
type AnyDb = ReturnType<typeof createTestDb>['d1'];

function ctx(d1: AnyDb, who: 'key' | string, body: unknown, bucket: { deleted: string[] }) {
  const url = 'https://sewmu-chatbot.pages.dev/api/admin-rooms?action=purge_internal' + (who === 'key' ? '&key=' + KEY : '');
  const h: Record<string, string> = { origin: 'https://sewmu-chatbot.pages.dev', 'user-agent': 'vitest' };
  if (who !== 'key') h.cookie = 'session=' + who;
  return {
    env: { DB: d1, ADMIN_KEY: KEY, MEDIA_BUCKET: { delete: async (k: string) => { bucket.deleted.push(k); } } },
    request: { url, method: 'POST', headers: { get: (k: string) => h[k.toLowerCase()] ?? null }, json: async () => body },
  };
}
async function purge(d1: AnyDb, who: 'key' | string, body: unknown, bucket = { deleted: [] as string[] }) {
  const r = await onRequestPost(ctx(d1, who, body, bucket));
  return { status: r.status, body: (await r.json()) as any, bucket };
}
const count = async (d1: AnyDb, sql: string) => Number(((await d1.prepare(sql).first()) as any)?.c) || 0;

let d1: AnyDb;
beforeEach(async () => {
  d1 = createTestDb().d1;
  await d1.prepare(`INSERT INTO users (id, name, real_name, is_admin, approval_status) VALUES (1, '이재윤', '이재윤', 1, 'approved_client')`).run();
  await d1.prepare(`INSERT INTO users (id, name, real_name, is_admin, approval_status) VALUES (2, '직원', '직원', 1, 'approved_client')`).run();
  await d1.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES ('tok-staff', 2, '2099-01-01 00:00:00')`).run();
  /* 관리자방 2개(옛 닫힌 방 + 현재) + 외부 상담방 1개 */
  for (const [id, internal, status] of [['internal_old', 1, 'closed'], ['internal_now', 1, 'active'], ['ABC123', 0, 'active']] as const) {
    await d1.prepare(`INSERT INTO chat_rooms (id, name, status, is_internal, created_at) VALUES (?, ?, ?, ?, '2026-01-01')`).bind(id, id, status, internal).run();
  }
  const msg = (room: string, content: string) =>
    d1.prepare(`INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at) VALUES (?, 1, 'human_advisor', ?, ?, '2026-01-02')`).bind('room_' + room, content, room).run();
  await msg('internal_now', '안녕');
  await msg('internal_now', '[IMG]/api/image?k=admin/only-internal.jpg');
  await msg('internal_now', '[FILE]{"url":"/api/file?k=admin/files/shared.pdf","name":"a.pdf","size":1}');
  await msg('internal_old', '옛 메시지');
  await msg('ABC123', '[FILE]{"url":"/api/file?k=admin/files/shared.pdf","name":"a.pdf","size":1}');   // 외부 방도 같은 키
  await msg('ABC123', '외부 방 메시지');
  await d1.prepare(`INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES ('internal_now', 1, 'admin', '2026-01-01'), ('internal_now', 2, 'admin', '2026-01-01'), ('ABC123', 2, 'admin', '2026-01-01')`).run();
  await d1.prepare(`INSERT INTO memos (room_id, content, created_at) VALUES ('internal_now', '관리자방 메모', '2026-01-03'), ('ABC123', '외부 메모', '2026-01-03')`).run();
  await d1.prepare(`INSERT INTO room_notices (room_id, content, created_at) VALUES ('internal_now', '공지', '2026-01-03')`).run().catch(() => {});
});

describe('관리자방 영구삭제', () => {
  it('dry-run — 건수만 세고 아무것도 안 지운다', async () => {
    const r = await purge(d1, 'key', {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, deleted: false, rooms: 2, messages: 4, members: 2, memos: 1, attachments: 1 });
    expect(r.bucket.deleted).toEqual([]);
    expect(await count(d1, `SELECT COUNT(*) AS c FROM chat_rooms`)).toBe(3);
  });

  it('직원은 403', async () => {
    expect((await purge(d1, 'tok-staff', { confirm: true })).status).toBe(403);
    expect(await count(d1, `SELECT COUNT(*) AS c FROM chat_rooms WHERE is_internal = 1`)).toBe(2);
  });

  it('confirm — 관리자방만 전부, 외부 방은 그대로, R2 는 관리자방 전용 키만', async () => {
    const r = await purge(d1, 'key', { confirm: true });
    expect(r.body).toMatchObject({ ok: true, deleted: true, rooms: 2, messages: 4, r2_deleted: 1 });
    expect(r.bucket.deleted).toEqual(['admin/only-internal.jpg']);     // shared.pdf 는 외부 방이 쓰니 남긴다
    expect(await count(d1, `SELECT COUNT(*) AS c FROM chat_rooms WHERE is_internal = 1`)).toBe(0);
    expect(await count(d1, `SELECT COUNT(*) AS c FROM conversations WHERE room_id LIKE 'internal_%'`)).toBe(0);
    expect(await count(d1, `SELECT COUNT(*) AS c FROM room_members WHERE room_id LIKE 'internal_%'`)).toBe(0);
    expect(await count(d1, `SELECT COUNT(*) AS c FROM memos WHERE room_id LIKE 'internal_%'`)).toBe(0);
    /* 외부 상담방 */
    expect(await count(d1, `SELECT COUNT(*) AS c FROM chat_rooms WHERE id = 'ABC123'`)).toBe(1);
    expect(await count(d1, `SELECT COUNT(*) AS c FROM conversations WHERE room_id = 'ABC123'`)).toBe(2);
    expect(await count(d1, `SELECT COUNT(*) AS c FROM room_members WHERE room_id = 'ABC123'`)).toBe(1);
    expect(await count(d1, `SELECT COUNT(*) AS c FROM memos WHERE room_id = 'ABC123'`)).toBe(1);
  });

  it('지운 뒤 다시 부르면 rooms:0 — 두 번 눌러도 안전', async () => {
    await purge(d1, 'key', { confirm: true });
    const again = await purge(d1, 'key', { confirm: true });
    expect(again.body).toMatchObject({ ok: true, deleted: false, rooms: 0 });
    expect(again.bucket.deleted).toEqual([]);
  });

  it('상담방 목록(GET)에서 관리자방은 더 이상 안 나온다 — internal=1 을 붙여도', async () => {
    // @ts-expect-error — JS module
    const { onRequestGet } = await import('./admin-rooms.js');
    const req = { url: 'https://sewmu-chatbot.pages.dev/api/admin-rooms?internal=1&key=' + KEY, method: 'GET', headers: { get: () => null } };
    const r = await onRequestGet({ env: { DB: d1, ADMIN_KEY: KEY }, request: req });
    const body = (await r.json()) as any;
    expect(body.rooms.map((x: any) => x.id)).toEqual(['ABC123']);
  });
});
