/**
 * 승인 화면 [연결] 버튼 — 사장님 2026-10-20 "자동 연결은 하지 말고 내 버튼은 있어야".
 *
 * 여기서 지키는 것:
 *  1. 사장님만 누를 수 있다 (직원 403, 키 없음 401/403)
 *  2. 서버가 후보를 다시 계산 — 후보 밖 사업장·동명이인·다른 카톡 계정은 거절하고 아무것도 안 바뀐다
 *  3. 한 번에: 위하고 사람과 합치기(사업장 전부 따라옴) + 고른 사업장 연결 + 기장거래처 승인 (+ 상담방)
 *  4. 다시 눌러도 중복 없음
 *  5. 합치기 고친 것: user_merges 기록이 남고(분리 가능), 카톡 쪽에 같은 사업장 행이 있어도 연결이 옮겨진다
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module
import { onRequestPost as linkPost } from './admin-client-link.js';
// @ts-expect-error — JS module
import { onRequestGet as matchGet } from './admin-client-match.js';
// @ts-expect-error — JS module
import { onRequestPost as usersPost } from './admin-users.js';

const KEY = 'test-admin-key';
const ORIGIN = 'https://sewmu-chatbot.pages.dev';
type AnyDb = ReturnType<typeof createTestDb>['d1'];
let d1: AnyDb;

async function ins(table: string, f: Record<string, unknown>) {
  const cols = Object.keys(f);
  await d1.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...Object.values(f)).run();
}
const link = (b: number, u: number, role = '대표자', extra: Record<string, unknown> = {}) =>
  ins('business_members', { business_id: b, user_id: u, role, ...extra });

function req(path: string, body: unknown, who: 'key' | string = 'key') {
  const url = ORIGIN + path + (who === 'key' ? (path.includes('?') ? '&' : '?') + 'key=' + KEY : '');
  const h: Record<string, string> = { origin: ORIGIN };
  if (who !== 'key') h.cookie = 'session=' + who;
  return { env: { DB: d1, ADMIN_KEY: KEY }, request: { url, method: 'POST', headers: { get: (k: string) => h[k.toLowerCase()] ?? null }, json: async () => body } };
}
async function post(body: unknown, who: 'key' | string = 'key') {
  const r = await linkPost(req('/api/admin-client-link', body, who));
  return { status: r.status, body: await r.json() as any };
}
const status = async (id: number) => ((await d1.prepare(`SELECT approval_status FROM users WHERE id = ?`).bind(id).first()) as any)?.approval_status;
const activeBiz = async (uid: number) => ((await d1.prepare(
  `SELECT business_id, role FROM business_members WHERE user_id = ? AND (removed_at IS NULL OR removed_at = '') ORDER BY business_id`
).bind(uid).all()).results || []) as any[];

beforeEach(async () => {
  d1 = createTestDb().d1;
  for (const sql of [
    `ALTER TABLE users ADD COLUMN claim_birth_date TEXT`,
    `ALTER TABLE users ADD COLUMN claim_business_number TEXT`,
    `ALTER TABLE users ADD COLUMN claim_at TEXT`,
  ]) await d1.prepare(sql).run();
  /* 위하고 홍길동 (manual) — 갑·을 법인, 병·정 개인 + 갑 지점 */
  await ins('users', { id: 100, real_name: '홍길동', name: '홍길동', provider: 'manual', provider_id: 'manual:wehago:홍길동', approval_status: 'approved_client', birth_date: '1972-04-20', phone: '010-1111-2222' });
  await ins('businesses', { id: 1, company_name: '(주)갑', business_number: '1018100001', corporate_number: '1101110000001', company_form: '0.법인사업자', ceo_name: '홍길동' });
  await ins('businesses', { id: 2, company_name: '을주식회사', business_number: '1018100002', company_form: '0.법인사업자', ceo_name: '홍길동' });
  await ins('businesses', { id: 3, company_name: '병식당', business_number: '2010000003', company_form: '1.개인사업자', ceo_name: '홍길동' });
  await ins('businesses', { id: 4, company_name: '정카페', business_number: '2010000004', company_form: '2.간이사업자', ceo_name: '홍길동', status: 'closed' });
  await ins('businesses', { id: 5, company_name: '(주)갑 대구지점', business_number: '1018100005', corporate_number: '1101110000001', company_form: '0.법인사업자', ceo_name: '홍길동', parent_business_id: 1 });
  for (const b of [1, 2, 3, 4]) await link(b, 100, '대표자', { is_primary: 1 });
  /* 동명이인 홍길동(1985) — 무관상사 */
  await ins('users', { id: 200, real_name: '홍길동', name: '홍길동', provider: 'manual', approval_status: 'approved_client', birth_date: '1985-01-01' });
  await ins('businesses', { id: 9, company_name: '무관상사', business_number: '3010000009', company_form: '1.개인사업자', ceo_name: '홍길동' });
  await link(9, 200);
  /* 카톡으로 들어온 홍길동 — 가입 때 생년월일·갑 사업자번호 */
  await ins('users', { id: 500, real_name: '홍길동', name: '길동이', provider: 'kakao', provider_id: 'k500', approval_status: 'pending', phone: '010-1111-2222', claim_birth_date: '1972-04-20', claim_business_number: '1018100001' });
  /* 직원 (staff) */
  await ins('users', { id: 50, real_name: '직원', name: '직원', provider: 'kakao', provider_id: 'k50', is_admin: 1, approval_status: 'approved_client' });
  await ins('sessions', { token: 'staff', user_id: 50, expires_at: '2099-01-01 00:00:00' });
});

describe('POST /api/admin-client-link — 권한', () => {
  it('직원은 403, 아무것도 안 바뀜', async () => {
    const r = await post({ user_id: 500, merge_user_id: 100, links: [] }, 'staff');
    expect(r.status).toBe(403);
    expect(await status(500)).toBe('pending');
  });
  it('로그인 없으면 거절', async () => {
    const r = await post({ user_id: 500, merge_user_id: 100 }, 'nobody');
    expect([401, 403]).toContain(r.status);
  });
});

describe('POST /api/admin-client-link — 2차 검증 (후보 밖은 거절)', () => {
  it('후보에 없는 사업장(동명이인의 무관상사)을 섞으면 400 + 아무것도 안 바뀜', async () => {
    const r = await post({ user_id: 500, merge_user_id: 100, links: [{ business_id: 9, role: '대표자' }] });
    expect(r.status).toBe(400);
    expect(await status(500)).toBe('pending');
    expect(await status(100)).toBe('approved_client');
    expect(await activeBiz(500)).toEqual([]);
  });
  it('동명이인(생년월일 다름)과는 합치지 못한다', async () => {
    const r = await post({ user_id: 500, merge_user_id: 200, links: [] });
    expect(r.status).toBe(400);
    expect(await status(200)).toBe('approved_client');
  });
  it('이미 다른 카톡 계정인 사람과는 합치지 않는다', async () => {
    await d1.prepare(`UPDATE users SET provider = 'kakao', provider_id = 'k100' WHERE id = 100`).run();
    const r = await post({ user_id: 500, merge_user_id: 100, links: [] });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('카톡');
  });
  it('직원 계정·위하고 계정은 연결 대상이 아니다', async () => {
    expect((await post({ user_id: 50, links: [{ business_id: 1, role: '담당자' }] })).status).toBe(400);
    expect((await post({ user_id: 100, links: [{ business_id: 1, role: '대표자' }] })).status).toBe(400);
  });
  it('아무것도 안 고르면 400', async () => {
    expect((await post({ user_id: 500, links: [] })).status).toBe(400);
  });
});

describe('POST /api/admin-client-link — 연결', () => {
  it('합치기 + 지점 연결 + 승인을 한 번에: 갑·을·병·정(합치면 따라옴) + 지점 = 5곳', async () => {
    const r = await post({ user_id: 500, merge_user_id: 100, links: [{ business_id: 5, role: '대표자' }] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, approval_status: 'approved_client', linked: 1, total_businesses: 5 });
    expect(await status(500)).toBe('approved_client');
    expect(await status(100)).toBe('merged');
    expect(((await d1.prepare(`SELECT approved_by FROM users WHERE id = 500`).first()) as any).approved_by).toBe('owner');
    expect((await activeBiz(500)).map((b) => b.business_id)).toEqual([1, 2, 3, 4, 5]);
    expect(await activeBiz(100)).toEqual([]);
    /* 위하고 생년월일이 카톡 계정으로 (빈 칸 채움) */
    expect(((await d1.prepare(`SELECT birth_date FROM users WHERE id = 500`).first()) as any).birth_date).toBe('1972-04-20');
    /* 합치기 기록이 남아야 분리 가능 (예전엔 안 남았음) */
    const m: any = await d1.prepare(`SELECT manual_user_id, kakao_user_id, merged_by_admin FROM user_merges`).first();
    expect(m).toMatchObject({ manual_user_id: 100, kakao_user_id: 500, merged_by_admin: 'owner' });
    expect(r.body.merged.merge_id).toBeTruthy();
    /* 감사 로그 */
    const a: any = await d1.prepare(`SELECT action, entity_id, after FROM audit_log WHERE action = 'client_link'`).first();
    expect(a).toMatchObject({ action: 'client_link', entity_id: 500 });
    expect(JSON.parse(a.after).merged_user_id).toBe(100);
  });

  it('지점은 이미 대표 표시가 있으면 대표자로 연결해도 기존 대표 표시를 지우지 않는다', async () => {
    await ins('users', { id: 110, real_name: '이대표', name: '이대표', provider: 'manual', approval_status: 'approved_client' });
    await link(5, 110, '대표자', { is_primary: 1 });
    await post({ user_id: 500, merge_user_id: 100, links: [{ business_id: 5, role: '대표자' }] });
    const rows = (await d1.prepare(`SELECT user_id, is_primary FROM business_members WHERE business_id = 5 ORDER BY user_id`).all()).results as any[];
    expect(rows).toEqual([{ user_id: 110, is_primary: 1 }, { user_id: 500, is_primary: 0 }]);
  });

  it('합치지 않고 담당자로만 연결 (경리) — 홍길동의 다른 사업장은 안 붙는다', async () => {
    await ins('users', { id: 700, real_name: '김경리', name: 'kk', provider: 'kakao', provider_id: 'k700', approval_status: 'pending', phone: '010-7777-7777', claim_birth_date: '1990-02-02', claim_business_number: '1018100001' });
    const r = await post({ user_id: 700, links: [{ business_id: 1, role: '담당자' }] });
    expect(r.status).toBe(200);
    expect(await activeBiz(700)).toEqual([{ business_id: 1, role: '담당자' }]);
    expect(await status(700)).toBe('approved_client');
    expect(await status(100)).toBe('approved_client');
  });

  it('다시 눌러도 중복 행이 생기지 않는다', async () => {
    await ins('users', { id: 700, real_name: '김경리', name: 'kk', provider: 'kakao', provider_id: 'k700', approval_status: 'pending', claim_birth_date: '1990-02-02', claim_business_number: '1018100001' });
    await post({ user_id: 700, links: [{ business_id: 1, role: '담당자' }] });
    await post({ user_id: 700, links: [{ business_id: 1, role: '담당자' }, { business_id: 1, role: '대표자' }] });
    const c: any = await d1.prepare(`SELECT COUNT(*) c FROM business_members WHERE user_id = 700`).first();
    expect(c.c).toBe(1);
  });

  it('상담방: 연결한 사업장에 열린 방이 있으면 들어간다 (닫힌 방·다른 사업장 방은 X)', async () => {
    await ins('users', { id: 700, real_name: '김경리', name: 'kk', provider: 'kakao', provider_id: 'k700', approval_status: 'pending', claim_birth_date: '1990-02-02', claim_business_number: '1018100001' });
    await ins('chat_rooms', { id: 'R1', name: '갑 상담방', status: 'active' });
    await ins('chat_rooms', { id: 'R2', name: '갑 옛방', status: 'closed' });
    await ins('chat_rooms', { id: 'R9', name: '무관 상담방', status: 'active' });
    await ins('room_businesses', { room_id: 'R1', business_id: 1 });
    await ins('room_businesses', { room_id: 'R2', business_id: 1 });
    await ins('room_businesses', { room_id: 'R9', business_id: 9 });
    const r = await post({ user_id: 700, links: [{ business_id: 1, role: '담당자' }], join_rooms: true });
    expect(r.body.rooms_joined).toBe(1);
    const rooms = (await d1.prepare(`SELECT room_id FROM room_members WHERE user_id = 700`).all()).results as any[];
    expect(rooms.map((x) => x.room_id)).toEqual(['R1']);
  });
});

describe('GET /api/admin-client-match — 화면용 표시', () => {
  it('사람마다 합칠 수 있는지 + 합치면 따라오는 사업장 목록', async () => {
    const r = await matchGet({ env: { DB: d1, ADMIN_KEY: KEY }, request: { url: ORIGIN + '/api/admin-client-match?user_id=500&key=' + KEY, method: 'GET', headers: { get: () => null } } });
    const b = await r.json() as any;
    expect(b.persons).toHaveLength(1);
    expect(b.persons[0]).toMatchObject({ user_id: 100, mergeable: true });
    expect([...b.persons[0].business_ids].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('합치기 고친 것 (admin-users merge_users 도 같은 코드)', () => {
  it('카톡 쪽에 같은 사업장 행(지워진 것)이 있어도 연결이 다 옮겨지고, 위하고 대표자 역할을 따른다', async () => {
    await link(1, 500, '담당자', { removed_at: '2026-01-01 00:00:00' });
    const r = await usersPost(req('/api/admin-users?action=merge_users', { kakao_user_id: 500, manual_user_id: 100 }));
    const body = await r.json() as any;
    expect(r.status).toBe(200);
    expect(body.merge_id).toBeTruthy();
    expect(await activeBiz(500)).toEqual([1, 2, 3, 4].map((id) => ({ business_id: id, role: '대표자' })));
    expect(await activeBiz(100)).toEqual([]);
    const c: any = await d1.prepare(`SELECT COUNT(*) c FROM business_members WHERE user_id = 500 AND business_id = 1`).first();
    expect(c.c).toBe(1);
  });
  it('분리(split_users)가 끝까지 된다 — 예전엔 기록이 없어서 분리 불가', async () => {
    const m = await (await usersPost(req('/api/admin-users?action=merge_users', { kakao_user_id: 500, manual_user_id: 100 }))).json() as any;
    const r = await usersPost(req('/api/admin-users?action=split_users', { merge_id: m.merge_id }));
    expect(r.status).toBe(200);
    const row: any = await d1.prepare(`SELECT unmerged_at FROM user_merges WHERE id = ?`).bind(m.merge_id).first();
    expect(row.unmerged_at).toBeTruthy();
  });
});
