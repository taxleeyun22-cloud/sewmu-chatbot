/**
 * 보안 점검 PR-2 (2026-11-21) — 업로드 파일(R2) 열람 권한. /api/image · /api/file 공통 (_media-auth.js)
 *
 * 예전: memos/·guides/ 만 관리자 확인. 신분증·사업자등록증·영수증·상담방 파일은 주소만 알면 로그인 없이 열렸다.
 * 지금:
 *  - 로그인 안 함 → 401
 *  - 관리자(사장님 비번 ?key= / 비번 쿠키 / 직원 로그인) → 전부
 *  - 거래처 → 본인이 올린 것 + 내가 들어가 있는 상담방에 올라온 것(메시지·영수증)
 *  - 나간 방, 남의 방, 남의 사업자등록증·신분증(biz_docs) → 403
 *  - memos/·guides/ → 관리자만
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module
import { onRequestGet as imageGet } from './image.js';
// @ts-expect-error — JS module
import { onRequestGet as fileGet } from './file.js';
// @ts-expect-error — JS module
import { onRequestPost as roomsPost } from './my-rooms.js';

const ORIGIN = 'https://sewmu-chatbot.pages.dev';
const KEY = 'test-admin-key';
let d1: ReturnType<typeof createTestDb>['d1'];
const bucket = { get: async () => ({ body: 'x', httpEtag: '"e"', writeHttpMetadata: (h: Headers) => h.set('Content-Type', 'image/jpeg') }) };

async function view(path: '/api/image' | '/api/file', key: string, who: string | null) {
  const h: Record<string, string> = {};
  if (who && who !== 'key') h.cookie = 'session=' + who;
  const url = ORIGIN + path + '?k=' + encodeURIComponent(key) + (who === 'key' ? '&key=' + KEY : '');
  const ctx = { env: { DB: d1, MEDIA_BUCKET: bucket, ADMIN_KEY: KEY }, request: { url, method: 'GET', headers: { get: (k: string) => h[k.toLowerCase()] ?? null } } };
  const r = path === '/api/image' ? await imageGet(ctx) : await fileGet(ctx);
  return r.status;
}

beforeEach(async () => {
  d1 = createTestDb().d1;
  for (const [id, name, admin] of [[1, '갑', 0], [2, '을', 0], [3, '병', 0], [9, '직원', 1]] as const) {
    await d1.prepare(`INSERT INTO users (id, name, real_name, approval_status, is_admin) VALUES (?, ?, ?, 'approved_client', ?)`).bind(id, name, name, admin).run();
    await d1.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')`).bind('tok' + id, id).run();
  }
  /* R1 = 갑·을 같이 있는 방, R2 = 병 혼자 */
  await d1.prepare(`INSERT INTO chat_rooms (id, name, status) VALUES ('R1', '갑을방', 'active'), ('R2', '병방', 'active')`).run();
  await d1.prepare(`INSERT INTO room_members (room_id, user_id, role) VALUES ('R1', 1, 'member'), ('R1', 2, 'member'), ('R2', 3, 'member')`).run();
  await d1.prepare(`INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at) VALUES
    ('room_R1', 1, 'user', '[IMG]/api/image?k=' || ?, 'R1', '2026-11-21 10:00:00'),
    ('room_R1', NULL, 'admin', '[FILE]{"url":"/api/file?k=' || ? || '&name=a.pdf","name":"a.pdf","size":1}', 'R1', '2026-11-21 10:01:00')`)
    .bind(encodeURIComponent('u1/1_aa.jpg'), encodeURIComponent('admin/files/1_bb.pdf')).run();
  await d1.prepare(`INSERT INTO documents (user_id, room_id, doc_type, image_key) VALUES (1, 'R1', 'receipt', 'documents/u1/2026-11/1_cc.jpg'), (3, 'R2', 'receipt', 'documents/u3/2026-11/1_dd.jpg')`).run();
});

describe('로그인 없이는 못 본다', () => {
  it('사진·파일·영수증·사업자등록증 모두 401', async () => {
    for (const k of ['u1/1_aa.jpg', 'documents/u1/2026-11/1_cc.jpg', 'biz_docs/u1/b5/biz_reg_1_x.jpg', 'admin/files/1_bb.pdf']) {
      expect(await view('/api/image', k, null)).toBe(401);
      expect(await view('/api/file', k, null)).toBe(401);
    }
  });
});

describe('거래처', () => {
  it('본인이 올린 사진·영수증·사업자등록증은 본다', async () => {
    expect(await view('/api/image', 'u1/1_aa.jpg', 'tok1')).toBe(200);
    expect(await view('/api/image', 'documents/u1/2026-11/1_cc.jpg', 'tok1')).toBe(200);
    expect(await view('/api/image', 'biz_docs/u1/b5/biz_reg_1_x.jpg', 'tok1')).toBe(200);
  });
  it('같은 방 사람은 방에 올라온 사진·파일·영수증을 본다', async () => {
    expect(await view('/api/image', 'u1/1_aa.jpg', 'tok2')).toBe(200);
    expect(await view('/api/file', 'admin/files/1_bb.pdf', 'tok2')).toBe(200);
    expect(await view('/api/image', 'documents/u1/2026-11/1_cc.jpg', 'tok2')).toBe(200);
  });
  it('다른 방 사람은 403 — 남의 영수증·사진·파일, 남의 사업자등록증', async () => {
    expect(await view('/api/image', 'u1/1_aa.jpg', 'tok3')).toBe(403);
    expect(await view('/api/file', 'admin/files/1_bb.pdf', 'tok3')).toBe(403);
    expect(await view('/api/image', 'documents/u1/2026-11/1_cc.jpg', 'tok3')).toBe(403);
    expect(await view('/api/image', 'documents/u3/2026-11/1_dd.jpg', 'tok1')).toBe(403);
    expect(await view('/api/image', 'biz_docs/u1/b5/biz_reg_1_x.jpg', 'tok2')).toBe(403);
  });
  it('방을 나가면 그 방 파일도 못 본다 (본인 것은 계속)', async () => {
    await d1.prepare(`UPDATE room_members SET left_at = '2026-11-21' WHERE room_id = 'R1' AND user_id = 2`).run();
    expect(await view('/api/image', 'u1/1_aa.jpg', 'tok2')).toBe(403);
    await d1.prepare(`UPDATE room_members SET left_at = '2026-11-21' WHERE room_id = 'R1' AND user_id = 1`).run();
    expect(await view('/api/image', 'u1/1_aa.jpg', 'tok1')).toBe(200);
  });
  it('메모 첨부·업무 가이드는 거래처 401', async () => {
    expect(await view('/api/file', 'memos/9/1_x.pdf', 'tok1')).toBe(401);
    expect(await view('/api/image', 'guides/1_x.png', 'tok1')).toBe(401);
  });
});

describe('2바퀴 검토 반영 — 남의 키를 내 방에 적어 권한 얻기 차단, 찾는 범위 좁히기', () => {
  async function send(tok: string, room: string, body: Record<string, unknown>) {
    const h: Record<string, string> = { cookie: 'session=' + tok, origin: ORIGIN };
    const r = await roomsPost({ env: { DB: d1 }, request: { url: ORIGIN + '/api/my-rooms?action=send', method: 'POST', headers: { get: (k: string) => h[k.toLowerCase()] ?? null }, json: async () => ({ room_id: room, ...body }) } });
    return r.status;
  }
  it('남의 파일 주소(u1)를 병이 자기 방(R2)에 사진·파일로 보내면 403, 그래도 열람 불가', async () => {
    expect(await send('tok3', 'R2', { image_url: '/api/image?k=' + encodeURIComponent('u1/1_aa.jpg') })).toBe(403);
    expect(await send('tok3', 'R2', { file_url: '/api/file?k=' + encodeURIComponent('admin/files/1_bb.pdf') + '&name=a.pdf', file_name: 'a.pdf' })).toBe(403);
    expect(await view('/api/image', 'u1/1_aa.jpg', 'tok3')).toBe(403);
  });
  it('글 중간에 남의 키를 적어도 열람 권한이 생기지 않음', async () => {
    expect(await send('tok3', 'R2', { content: '이거 봐주세요 /api/image?k=' + encodeURIComponent('u1/1_aa.jpg') + ' u1/1_aa.jpg' })).toBe(200);
    expect(await view('/api/image', 'u1/1_aa.jpg', 'tok3')).toBe(403);
  });
  it('본인 파일은 보낼 수 있고, 같은 방 사람이 본다 (키의 업로드 시각 ±범위 안 메시지)', async () => {
    const ts = Date.parse('2026-11-21T01:00:00Z');
    const key = 'u1/files/' + ts + '_abcdef123456.pdf';
    await d1.prepare(`UPDATE room_members SET left_at = NULL`).run();
    expect(await send('tok1', 'R1', { file_url: '/api/file?k=' + encodeURIComponent(key) + '&name=a.pdf', file_name: 'a.pdf' })).toBe(200);
    /* send 는 지금 시각으로 저장되므로, 키 시각 범위 확인용으로 시각을 키 근처로 맞춘다 */
    await d1.prepare(`UPDATE conversations SET created_at = '2026-11-21 10:05:00' WHERE content LIKE '[FILE]%' || ? || '%'`).bind(String(ts)).run();
    expect(await view('/api/file', key, 'tok2')).toBe(200);
    /* 범위(하루 전~30일 뒤) 밖에 있는 메시지면 인정 안 함 */
    await d1.prepare(`UPDATE conversations SET created_at = '2027-03-01 00:00:00' WHERE content LIKE '[FILE]%' || ? || '%'`).bind(String(ts)).run();
    expect(await view('/api/file', key, 'tok2')).toBe(403);
  });
});

describe('관리자', () => {
  it('사장님 비번(?key=)·직원 로그인은 전부', async () => {
    for (const who of ['key', 'tok9']) {
      for (const k of ['u1/1_aa.jpg', 'documents/u3/2026-11/1_dd.jpg', 'biz_docs/u1/b5/biz_reg_1_x.jpg', 'memos/9/1_x.pdf', 'guides/1_x.png']) {
        expect(await view('/api/image', k, who)).toBe(200);
      }
    }
  });
});
