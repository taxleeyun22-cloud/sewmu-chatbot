/**
 * 근태·당번·연차 — 실제 엔드포인트(attendance.js)를 SQLite(D1 호환)에 붙여 끝까지 돌린다.
 *
 * 순수함수 테스트로는 못 잡는 것: upsert·부분 UNIQUE 인덱스·batch·세션 인증·owner 분기.
 * 시나리오 = 사장님이 말한 그대로:
 *   3명(가·나·다) 주 단위 당번 · 당번 09:00 / 나머지 09:30 · 1분 유예 ·
 *   당번 날 연차는 교체가 먼저 · 교체는 상대 수락으로 끝 · 승인은 사장님만
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { onRequestGet, onRequestPost } from './attendance.js';

const KEY = 'test-admin-key';
type AnyDb = ReturnType<typeof createTestDb>['d1'];

/** who: 'key'(사장님 비번) 또는 세션 토큰.
 *  Request 대신 최소 객체 — 테스트 환경의 Request 는 Cookie·Origin 을 금지 헤더로 버린다
 *  (엔드포인트가 읽는 건 url · method · headers.get · json() 뿐). */
function ctx(d1: AnyDb, who: string, method: 'GET' | 'POST', qs: string, body?: unknown) {
  const url = 'https://sewmu-chatbot.pages.dev/api/attendance?' + qs + (who === 'key' ? '&key=' + KEY : '');
  const h: Record<string, string> = { origin: 'https://sewmu-chatbot.pages.dev', 'user-agent': 'vitest' };
  if (who !== 'key') h.cookie = 'session=' + who;
  const request = {
    url, method,
    headers: { get: (k: string) => h[k.toLowerCase()] ?? null },
    json: async () => (body === undefined ? {} : JSON.parse(JSON.stringify(body))),
  };
  return { env: { DB: d1, ADMIN_KEY: KEY }, request };
}
async function get(d1: AnyDb, who: string, qs: string) {
  const r = await onRequestGet(ctx(d1, who, 'GET', qs));
  return { status: r.status, body: (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text() } as { status: number; body: any };
}
async function post(d1: AnyDb, who: string, action: string, body: unknown = {}) {
  const r = await onRequestPost(ctx(d1, who, 'POST', 'action=' + action, body));
  return { status: r.status, body: await r.json() } as { status: number; body: any };
}
/** KST 시각으로 시계를 맞춘다 */
function at(kst: string) { vi.setSystemTime(new Date(kst.replace(' ', 'T') + '+09:00')); }

let d1: AnyDb;
const GA = 'tok-ga', NA = 'tok-na', DA = 'tok-da', CLIENT = 'tok-client';
let ga = 0, na = 0, da = 0;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('2026-10-12 08:00:00');            // 월요일 (10/5 주는 개천절 대체공휴일 10/5 · 한글날 10/9 가 있어 피한다)
  d1 = createTestDb().d1;
  const add = async (name: string, isAdmin: number, tok: string) => {
    const r = await d1.prepare(`INSERT INTO users (name, real_name, is_admin, approval_status) VALUES (?, ?, ?, 'approved_client')`).bind(name, name, isAdmin).run();
    await d1.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')`).bind(tok, r.meta.last_row_id).run();
    return r.meta.last_row_id;
  };
  /* user_id=1 은 사장님 (checkAdmin 이 legacy 로 owner 취급) — 직원이 1번이 되면 테스트가 거짓으로 통과한다 */
  await add('이재윤', 1, 'tok-owner');
  await post(d1, 'key', 'profile', { user_id: 1, tracked: false });
  ga = await add('가', 1, GA); na = await add('나', 1, NA); da = await add('다', 1, DA);
  await add('거래처', 0, CLIENT);
  /* 사장님: 순서 가→나→다, 이번 주(10/12)부터. 올해 연차 확정 */
  expect((await post(d1, 'key', 'rotation', { members: [ga, na, da], effective_from: '2026-10-12' })).body.ok).toBe(true);
  for (const u of [ga, na, da]) expect((await post(d1, 'key', 'leave_grant', { user_id: u, year: 2026, days: 15 })).body.ok).toBe(true);
});
afterEach(() => { vi.useRealTimers(); });

describe('출근', () => {
  it('당번은 09:00 정각까지 정상 (유예 없음 — 사장님 "1분 유예도 빼버리자"), 재찍기는 처음 시각 유지', async () => {
    at('2026-10-12 09:00:59');
    const p = await post(d1, GA, 'punch');
    expect(p.body).toMatchObject({ ok: true, check_in: '09:00' });
    const me = (await get(d1, GA, 'view=me')).body;
    expect(me.today_cell).toMatchObject({ duty: true, start: '09:00', check_in: '09:00', late: false });
    expect(me.settings.grace_minutes).toBe(0);

    at('2026-10-12 09:10:00');
    expect((await post(d1, GA, 'punch')).body).toMatchObject({ already: true, check_in: '09:00' });
  });

  it('당번 09:01:00 은 지각 — DB 에 유예 1 이 남아 있어도 무시', async () => {
    await d1.prepare(`UPDATE staff_attendance_settings SET grace_minutes = 1 WHERE id = 1`).run();
    at('2026-10-13 09:01:00');
    await post(d1, GA, 'punch');
    const me = (await get(d1, GA, 'view=me')).body;
    expect(me.today_cell).toMatchObject({ duty: true, check_in: '09:01', late: true });
    expect(me.settings.grace_minutes).toBe(0);
  });

  it('당번이 아니면 09:30 기준 — 09:32 는 지각', async () => {
    at('2026-10-12 09:32:00');
    await post(d1, NA, 'punch');
    const today = (await get(d1, 'key', 'view=today')).body;
    const row = today.rows.find((r: any) => r.id === na);
    expect(row).toMatchObject({ duty: false, start: '09:30', check_in: '09:32', late: true });
    expect(today.duty_name).toBe('가');
    /* 안 찍은 사람은 기록 없음 */
    expect(today.rows.find((r: any) => r.id === da).check_in).toBeNull();
  });

  /* 사장님 2026-10-02: "당번이 다 없으면 9시가 출근임" */
  it('당번 순서가 아직 없는 주(10/6, 순서는 10/12 부터) — 전원 09:00 기준, 09:05 는 지각', async () => {
    at('2026-10-06 09:05:00');
    await post(d1, NA, 'punch');
    const me = (await get(d1, NA, 'view=me')).body;
    expect(me.today_cell).toMatchObject({ duty: false, no_duty: true, start: '09:00', check_in: '09:05', late: true });
    const today = (await get(d1, 'key', 'view=today')).body;
    expect(today).toMatchObject({ duty_user: null, duty_name: null, no_duty: true, duty_absent: false });
    expect(today.rows.find((r: any) => r.id === na)).toMatchObject({ start: '09:00', late: true });
    expect(today.rows.find((r: any) => r.id === da)).toMatchObject({ start: '09:00', check_in: null, late: false });
  });

  /* 2026-10-06 사장님 "당번 아닌데 9:30 이전인데 왜 지각?" — 당번 연차는 "당번 없음" 이 아니다. 09:27 정상 */
  it('당번이 승인 연차로 빠진 날 — 나머지는 평소대로 09:30 (오늘·월별·CSV·이달 지각 수)', async () => {
    await d1.prepare(`INSERT INTO staff_leave_requests (user_id, leave_date, reason, status, requested_at, reviewed_at) VALUES (?, '2026-10-21', '병원', 'approved', '2026-10-01 09:00:00', '2026-10-01 10:00:00')`).bind(na).run();
    at('2026-10-21 09:27:00');
    await post(d1, DA, 'punch');
    const today = (await get(d1, 'key', 'view=today')).body;
    expect(today).toMatchObject({ duty_user: na, duty_name: '나', duty_absent: true, no_duty: false });
    expect(today.rows.find((r: any) => r.id === da)).toMatchObject({ duty: false, no_duty: false, start: '09:30', check_in: '09:27', late: false });
    expect(today.rows.find((r: any) => r.id === na)).toMatchObject({ duty: true, leave: 'approved', check_in: null, late: false });
    const month = (await get(d1, 'key', 'view=month&month=2026-10')).body;
    const daRow = month.rows.find((r: any) => r.id === da);
    expect(daRow.cells['2026-10-21']).toMatchObject({ no_duty: false, start: '09:30', late: false });
    const csv = (await get(d1, 'key', 'view=month&month=2026-10&format=csv')).body as string;
    expect(csv).toContain('2026-10-21,수,다,,09:30,09:27,,');
    expect((await get(d1, DA, 'view=me')).body.month.late).toBe(0);
  });

  it('주말에 찍은 건 당번 없음 취급 안 함 — 09:30 기준 그대로', async () => {
    at('2026-10-17 09:40:00');            // 토요일
    await post(d1, GA, 'punch');
    const me = (await get(d1, GA, 'view=me')).body;
    expect(me.today_cell).toMatchObject({ no_duty: false, start: '09:30' });
  });

  it('사장님 비번 접속으로는 찍을 수 없다 (누구 출근인지 모름)', async () => {
    const r = await post(d1, 'key', 'punch');
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('세션 로그인');
  });

  it('거래처는 들어오지 못한다', async () => {
    expect((await get(d1, CLIENT, 'view=me')).status).toBe(401);
    expect((await post(d1, CLIENT, 'punch')).status).toBe(401);
  });

  it('근태 대상에서 빼면 찍을 수 없고 명단에서도 빠진다', async () => {
    await post(d1, 'key', 'profile', { user_id: da, tracked: false });
    expect((await post(d1, DA, 'punch')).status).toBe(403);
    expect((await get(d1, 'key', 'view=today')).body.rows.map((r: any) => r.id)).not.toContain(da);
  });
});

describe('당번 날 연차 → 교체 → 승인', () => {
  it('전체 흐름', async () => {
    /* 1. 가(이번 주 당번)가 수요일 연차 신청 → 거부, 교체 먼저 */
    let r = await post(d1, GA, 'leave_request', { dates: ['2026-10-14'] });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('당번');
    expect(r.body.duty_date).toBe('2026-10-14');

    /* 2. 가 → 나 교체 요청, 나 수락 */
    r = await post(d1, GA, 'swap_request', { to_user: na, duty_date: '2026-10-14', reason: '병원' });
    expect(r.body.ok).toBe(true);
    const meNa = (await get(d1, NA, 'view=me')).body;
    expect(meNa.swaps.received).toHaveLength(1);
    expect(meNa.swaps.received[0]).toMatchObject({ from_name: '가', duty_date: '2026-10-14', reason: '병원' });
    r = await post(d1, NA, 'swap_respond', { id: meNa.swaps.received[0].id, accept: true });
    expect(r.body).toMatchObject({ ok: true, status: 'accepted' });

    /* 그날 당번은 나 — 나 기준 09:00 */
    const duty = (await get(d1, 'key', 'view=duty&from=2026-10-12&weeks=1')).body;
    const wed = duty.grid[0].days.find((x: any) => x.date === '2026-10-14');
    expect(wed).toMatchObject({ user_id: na, override: 'swap' });

    /* 3. 이제 가 연차 신청 통과 */
    r = await post(d1, GA, 'leave_request', { dates: ['2026-10-14'], reason: '병원' });
    expect(r.body).toMatchObject({ ok: true, count: 1 });
    /* 같은 날 다시 신청 → 거부 */
    expect((await post(d1, GA, 'leave_request', { dates: ['2026-10-14'] })).body.error).toContain('이미');

    /* 4. 직원은 승인 못 함, 사장님만 */
    const lv = (await get(d1, 'key', 'view=leave&year=2026')).body;
    expect(lv.pending).toHaveLength(1);
    expect(lv.pending[0]).toMatchObject({ name: '가', is_duty: false });
    expect((await get(d1, 'key', 'view=badge')).body.pending_leave).toBe(1);
    expect((await post(d1, NA, 'leave_review', { id: lv.pending[0].id, approve: true })).status).toBe(403);
    expect((await post(d1, 'key', 'leave_review', { id: lv.pending[0].id, approve: true })).body.status).toBe('approved');

    const meGa = (await get(d1, GA, 'view=me')).body;
    expect(meGa.leave).toMatchObject({ days: 15, approved: 1, remaining: 14 });
    expect((await get(d1, 'key', 'view=badge')).body.pending_leave).toBe(0);
  });

  it('대신 설 사람이 그날 연차면 수락이 안 된다', async () => {
    /* 다음 주(10/19~) 당번은 나. 다가 10/21 연차를 먼저 신청해 둠 */
    expect((await post(d1, DA, 'leave_request', { dates: ['2026-10-21'] })).body.ok).toBe(true);
    const r = await post(d1, NA, 'swap_request', { to_user: da, duty_date: '2026-10-21' });
    expect(r.body.ok).toBe(true);
    const id = (await get(d1, DA, 'view=me')).body.swaps.received[0].id;
    const acc = await post(d1, DA, 'swap_respond', { id, accept: true });
    expect(acc.status).toBe(400);
    expect(acc.body.error).toContain('연차');
    /* 당번은 그대로 나 */
    const duty = (await get(d1, 'key', 'view=duty&from=2026-10-19&weeks=1')).body;
    expect(duty.grid[0].days.find((x: any) => x.date === '2026-10-21').user_id).toBe(na);
  });

  it('맞교환은 두 날이 같이 바뀐다', async () => {
    /* 가 10/14 ↔ 나 10/20 */
    await post(d1, GA, 'swap_request', { to_user: na, duty_date: '2026-10-14', return_date: '2026-10-20' });
    const id = (await get(d1, NA, 'view=me')).body.swaps.received[0].id;
    expect((await post(d1, NA, 'swap_respond', { id, accept: true })).body.ok).toBe(true);
    const duty = (await get(d1, 'key', 'view=duty&from=2026-10-12&weeks=2')).body;
    const day = (d: string) => duty.grid.flatMap((w: any) => w.days).find((x: any) => x.date === d).user_id;
    expect(day('2026-10-14')).toBe(na);
    expect(day('2026-10-20')).toBe(ga);
    expect(day('2026-10-15')).toBe(ga);   // 나머지는 순서대로
  });

  it('남의 당번 날은 교체 요청을 못 한다', async () => {
    const r = await post(d1, NA, 'swap_request', { to_user: da, duty_date: '2026-10-14' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('내 당번이 아닙니다');
  });
});

describe('사장님 수정 · 월별 · CSV', () => {
  it('시각만 고치면 메모가 남는다', async () => {
    await post(d1, 'key', 'edit', { user_id: na, work_date: '2026-10-12', check_in: '09:10', note: '외근 후 출근' });
    await post(d1, 'key', 'edit', { user_id: na, work_date: '2026-10-12', check_in: '09:05' });
    const m = (await get(d1, 'key', 'view=month&month=2026-10')).body;
    const c = m.rows.find((r: any) => r.id === na).cells['2026-10-12'];
    expect(c).toMatchObject({ check_in: '09:05', note: '외근 후 출근', edited: true, late: false });
  });

  it('직원은 수정할 수 없다', async () => {
    expect((await post(d1, GA, 'edit', { user_id: ga, work_date: '2026-10-12', check_in: '08:00' })).status).toBe(403);
  });

  it('CSV — BOM, 당번·지각·연차 열', async () => {
    at('2026-10-12 09:40:00');
    await post(d1, NA, 'punch');
    const r = await onRequestGet(ctx(d1, 'key', 'GET', 'view=month&month=2026-10&format=csv'));
    expect(r.headers.get('content-type')).toContain('text/csv');
    /* text() 는 디코딩하면서 BOM 을 떼므로 바이트로 확인 */
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('날짜,요일,직원,당번,기준시각,출근시각,지각,연차,메모');
    expect(text).toContain('2026-10-12,월,나,,09:30,09:40,지각');
    expect(text).toContain('2026-10-12,월,가,당번,09:00,,');
  });

  it('하루 당번 지정 — 연차 승인된 사람이면 한 번 더 확인', async () => {
    await post(d1, DA, 'leave_request', { dates: ['2026-10-15'] });
    const id = (await get(d1, 'key', 'view=leave&year=2026')).body.pending[0].id;
    await post(d1, 'key', 'leave_review', { id, approve: true });
    const r = await post(d1, 'key', 'duty_set', { duty_date: '2026-10-15', user_id: da });
    expect(r.status).toBe(409);
    expect(r.body.need_force).toBe(true);
    expect((await post(d1, 'key', 'duty_set', { duty_date: '2026-10-15', user_id: da, force: true })).body.ok).toBe(true);
  });

  it('주 전체 일괄 지정 — 월~금 5칸, 연차 끼면 확인, 지우면 순서대로, 직원은 403', async () => {
    const r = await post(d1, 'key', 'duty_set_week', { monday: '2026-10-19', user_id: da });
    expect(r.body).toMatchObject({ ok: true, days: 5 });
    let duty = (await get(d1, 'key', 'view=duty&from=2026-10-19&weeks=1')).body;
    expect(duty.grid[0].days.map((x: any) => [x.user_id, x.override])).toEqual(Array(5).fill([da, 'owner']));
    /* 월요일이 아니면 거절 */
    expect((await post(d1, 'key', 'duty_set_week', { monday: '2026-10-20', user_id: da })).status).toBe(400);
    /* 그 주에 연차 승인된 사람을 넣으면 한 번 더 확인 (어느 날인지 알려준다) */
    await post(d1, NA, 'leave_request', { dates: ['2026-10-21'] });
    const id = (await get(d1, 'key', 'view=leave&year=2026')).body.pending[0].id;
    await post(d1, 'key', 'leave_review', { id, approve: true });
    const c = await post(d1, 'key', 'duty_set_week', { monday: '2026-10-19', user_id: na });
    expect(c.status).toBe(409);
    expect(c.body).toMatchObject({ need_force: true, leave_dates: ['2026-10-21'] });
    expect((await post(d1, 'key', 'duty_set_week', { monday: '2026-10-19', user_id: na, force: true })).body.ok).toBe(true);
    /* 지우면 그 주는 다시 순서대로 (10/19 주 = 나 차례) */
    expect((await post(d1, 'key', 'duty_set_week', { monday: '2026-10-19', clear: true })).body.ok).toBe(true);
    duty = (await get(d1, 'key', 'view=duty&from=2026-10-19&weeks=1')).body;
    expect(duty.grid[0].days.every((x: any) => x.user_id === na && !x.override)).toBe(true);
    /* 다른 주는 손대지 않았다 */
    expect((await get(d1, 'key', 'view=duty&from=2026-10-12&weeks=1')).body.grid[0].days.every((x: any) => x.user_id === ga && !x.override)).toBe(true);
    expect((await post(d1, GA, 'duty_set_week', { monday: '2026-10-19', user_id: ga })).status).toBe(403);
  });

  it('순서를 바꿔도 지난 주 당번은 그대로', async () => {
    await post(d1, 'key', 'rotation', { members: [da, ga, na], effective_from: '2026-10-26' });
    const duty = (await get(d1, 'key', 'view=duty&from=2026-10-12&weeks=3')).body;
    expect(duty.grid.map((w: any) => w.days[0].user_id)).toEqual([ga, na, da]);
    const later = (await get(d1, 'key', 'view=duty&from=2026-10-26&weeks=2')).body;
    expect(later.grid.map((w: any) => w.days[0].user_id)).toEqual([da, ga]);
  });

  it('입사일을 넣으면 제안값과 근거가 나온다 (확정 전엔 신청 불가)', async () => {
    await post(d1, 'key', 'profile', { user_id: da, hire_date: '2023-03-02' });
    const lv = (await get(d1, 'key', 'view=leave&year=2027')).body;
    const row = lv.rows.find((r: any) => r.id === da);
    expect(row).toMatchObject({ suggested: 16, days: null });
    expect(row.basis).toContain('가산 1일');
    at('2027-01-04 09:00:00');
    expect((await post(d1, DA, 'leave_request', { dates: ['2027-01-05'] })).body.error).toContain('확정');
  });
});

/* 2026-10-08 사장님: "직원은 관리자" — admin_role 이 editor/viewer 여도 조회는 되고 수정은 안 된다 */
describe('직원 권한 — 조회 OK · 수정 403', () => {
  it('직원은 당번표만 보고, 동료 출근·지각·연차는 못 본다 (사장님: "지는 지꺼만")', async () => {
    await d1.prepare(`UPDATE users SET admin_role = 'editor' WHERE id = ?`).bind(na).run();
    expect((await get(d1, NA, 'view=duty&from=2026-10-12&weeks=1')).status).toBe(200);
    expect((await get(d1, NA, 'view=today')).status).toBe(403);
    expect((await get(d1, NA, 'view=month&month=2026-10')).status).toBe(403);
    expect((await get(d1, NA, 'view=month&month=2026-10&format=csv')).status).toBe(403);
    expect((await get(d1, NA, 'view=leave&year=2026')).status).toBe(403);
    /* 사장님은 전부 */
    expect((await get(d1, 'key', 'view=today')).status).toBe(200);
    expect((await post(d1, NA, 'edit', { user_id: na, work_date: '2026-10-12', check_in: '08:00' })).status).toBe(403);
    expect((await post(d1, NA, 'leave_grant', { user_id: na, year: 2026, days: 30 })).status).toBe(403);
    expect((await post(d1, NA, 'rotation', { members: [na], effective_from: '2026-10-19' })).status).toBe(403);
  });

  it('뱃지: 직원에겐 나에게 온 교체, 사장님에겐 승인 대기', async () => {
    await post(d1, GA, 'swap_request', { to_user: na, duty_date: '2026-10-14' });
    await post(d1, DA, 'leave_request', { dates: ['2026-10-15'] });
    /* 직원 뱃지엔 동료 연차 대기 건수가 안 실린다 */
    expect((await get(d1, NA, 'view=badge')).body).toMatchObject({ owner: false, my_swaps: 1, pending_leave: 0 });
    expect((await get(d1, 'key', 'view=badge')).body).toMatchObject({ owner: true, my_swaps: 0, pending_leave: 1 });
  });
});

describe('연차 현황 — 사람별 내역', () => {
  it('view=leave 행마다 날짜별 신청 내역이 실린다 (취소 건 제외, 최신순)', async () => {
    await post(d1, DA, 'leave_request', { dates: ['2026-10-15', '2026-10-16'] });
    const ids = (await get(d1, 'key', 'view=leave&year=2026')).body.pending.map((p: any) => p.id);
    await post(d1, 'key', 'leave_review', { id: ids[0], approve: true });
    await post(d1, 'key', 'leave_review', { id: ids[1], approve: false, note: '마감 주' });
    /* 10/26 주는 다의 당번 주라 10/27 은 거부된다 — 나의 주(10/20)로 */
    await post(d1, DA, 'leave_request', { dates: ['2026-10-20'] });
    const id3 = (await get(d1, 'key', 'view=leave&year=2026')).body.pending[0].id;
    await post(d1, DA, 'leave_cancel', { id: id3 });
    const row = (await get(d1, 'key', 'view=leave&year=2026')).body.rows.find((r: any) => r.id === da);
    expect(row.requests.map((r: any) => [r.leave_date, r.status])).toEqual([['2026-10-16', 'rejected'], ['2026-10-15', 'approved']]);
    expect(row.requests[0].review_note).toBe('마감 주');
    expect(row).toMatchObject({ approved: 1, pending: 0, remaining: 14 });
  });
});

/* 2026-10-02 사장님 "깔쌈하게": 묶음 승인·반려 */
describe('묶음 승인·반려', () => {
  it('leave_review_many — 되는 건 처리하고 안 되는 건 사유와 함께 돌려준다, 직원은 403', async () => {
    await post(d1, DA, 'leave_request', { dates: ['2026-10-14', '2026-10-15'] });   // 다: 나 당번 주
    await post(d1, NA, 'leave_request', { dates: ['2026-10-29'] });                 // 나: 다 당번 주
    const pend = (await get(d1, 'key', 'view=leave&year=2026')).body.pending;
    const ids = pend.map((p: any) => p.id);
    expect(ids).toHaveLength(3);
    expect((await post(d1, NA, 'leave_review_many', { ids, approve: true })).status).toBe(403);
    const r = await post(d1, 'key', 'leave_review_many', { ids: [...ids, 9999], approve: true });
    expect(r.body).toMatchObject({ ok: true, done: 3 });
    expect(r.body.failed).toHaveLength(1);
    expect(r.body.failed[0].error).toContain('#9999');
    const lv = (await get(d1, 'key', 'view=leave&year=2026')).body;
    expect(lv.pending).toHaveLength(0);
    expect(lv.recent.filter((x: any) => x.status === 'approved')).toHaveLength(3);
    /* 이미 처리된 건은 실패로 */
    const again = await post(d1, 'key', 'leave_review_many', { ids: [ids[0]], approve: false, note: 'x' });
    expect(again.body).toMatchObject({ done: 0 });
    expect(again.body.failed[0].error).toContain('이미 처리');
    /* 사장님 취소 → 메모 "사장님 취소", 본인 취소 → 메모 없음 */
    await post(d1, 'key', 'leave_cancel', { id: ids[0] });
    await post(d1, NA, 'leave_request', { dates: ['2026-10-30'] });
    const mine = (await get(d1, NA, 'view=me')).body.leave.requests.find((x: any) => x.leave_date === '2026-10-30');
    await post(d1, NA, 'leave_cancel', { id: mine.id });
    const rec = (await get(d1, 'key', 'view=leave&year=2026')).body.recent;
    expect(rec.find((x: any) => x.id === ids[0])).toMatchObject({ status: 'cancelled', review_note: '사장님 취소' });
    expect(rec.find((x: any) => x.id === mine.id)).toMatchObject({ status: 'cancelled', review_note: null });
  });
});

/* 2026-10-02 사장님: "법정공휴일은 체크 안되나??" */
describe('공휴일', () => {
  it('공휴일 표 — 법정 고정 + 대체 + 2026 음력 seed, 직원도 조회', async () => {
    const list = (await get(d1, NA, 'view=holidays&year=2026')).body.list;
    const by = Object.fromEntries(list.map((h: any) => [h.ymd, h]));
    expect(by['2026-10-09']).toMatchObject({ name: '한글날', source: 'fixed' });
    expect(by['2026-10-05']).toMatchObject({ name: '개천절 대체공휴일', source: 'substitute' });
    expect(by['2026-02-17']).toMatchObject({ name: '설날', source: 'seed', sub_rule: 'sunday' });
    expect(by['2026-05-25']).toMatchObject({ name: '부처님오신날 대체공휴일', source: 'substitute' });
    expect(by['2026-06-03'].name).toContain('지방선거');
    expect(list.length).toBe(20);
  });

  it('공휴일엔 당번이 없고, 연차 신청·하루 지정이 막히고, 주 전체 지정은 건너뛴다', async () => {
    /* 10/19 주(나 당번)에 임시공휴일 10/21 등록 — 사장님만 */
    expect((await post(d1, NA, 'holiday_add', { ymd: '2026-10-21', name: '임시공휴일' })).status).toBe(403);
    expect((await post(d1, 'key', 'holiday_add', { ymd: '2026-10-21', name: '임시공휴일' })).body.ok).toBe(true);
    const wk = (await get(d1, 'key', 'view=duty&from=2026-10-19&weeks=1')).body.grid[0].days;
    expect(wk.find((x: any) => x.date === '2026-10-21')).toMatchObject({ user_id: null, holiday: '임시공휴일' });
    expect(wk.find((x: any) => x.date === '2026-10-20').user_id).toBe(na);
    const lv = await post(d1, DA, 'leave_request', { dates: ['2026-10-21'] });
    expect(lv.status).toBe(400);
    expect(lv.body.error).toContain('공휴일(임시공휴일)');
    expect((await post(d1, 'key', 'duty_set', { duty_date: '2026-10-21', user_id: da })).body.error).toContain('공휴일');
    expect((await post(d1, 'key', 'duty_set_week', { monday: '2026-10-19', user_id: da })).body.days).toBe(4);
    /* 지우면 다시 당번이 선다 */
    expect((await post(d1, 'key', 'holiday_del', { ymd: '2026-10-21' })).body.ok).toBe(true);
    expect((await post(d1, 'key', 'holiday_del', { ymd: '2026-10-09' })).status).toBe(404);   // 법정은 못 지움
    expect((await post(d1, 'key', 'holiday_add', { ymd: '2026-10-09', name: 'x' })).status).toBe(400);
  });

  it('오늘이 공휴일이면 weekday=false + 이름, 월별 표에서도 칸이 빠진다', async () => {
    at('2026-10-09 09:00:00');
    const t = (await get(d1, 'key', 'view=today')).body;
    expect(t).toMatchObject({ weekday: false, holiday: '한글날', duty_name: null });
    const me = (await get(d1, GA, 'view=me')).body;
    expect(me).toMatchObject({ weekday: false, holiday: '한글날' });
    expect(me.holidays['2026-10-09']).toBe('한글날');
    expect(me.holidays['2026-12-25']).toBe('기독탄신일');
    const m = (await get(d1, 'key', 'view=month&month=2026-10')).body;
    expect(m.holidays['2026-10-09']).toBe('한글날');
    expect(m.rows[0].cells['2026-10-09']).toBeUndefined();
    expect(m.rows[0].cells['2026-10-08']).toBeDefined();
  });
});
