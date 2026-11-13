/**
 * 기장료 수납 (/api/admin-bk-fees) — CMS 회원목록 기준.
 *   사장님 2026-11-13: "난 이 4개만 올릴거야 … 이 4개로 다 할 수 있게."
 *   "일단 cms 위주로 돌고 이체하는 곳은 수기로 등록. 위하고 준 건 사업자번호 등 참조하라고.
 *    기본은 cms 회원목록이고 정지했거나 그런 건 따로 빼면 됨."
 *
 * 지키는 것:
 *  1. 거래처 = CMS 회원목록(회원번호마다 한 곳). 다시 올리면 금액·상태만 최신, 시작월은 유지, 종료일 풀리면 종료 해제
 *  2. 정지·해지 = 신청불능 / 결제종료일 지남 / 출금불가인데 결제조회 기간 내내 출금 기록 없음 → 따로 보기
 *  3. 귀속월 = 거래처 약정일 기준 (약정일 이후 출금 = 그 달, 전 = 전달 재출금). 성공만 ○, 출금중 ⋯, 실패는 사유
 *  4. 결제조회 자료가 없는 달은 ✕ 가 아니라 – (계좌·카드 따로, 그 달 본출금이 파일에 있는 달부터)
 *  5. 파일 올리는 순서가 달라도 결과가 같다. 같은 파일 다시 올려도 안 쌓인다. 수기 입금확인은 안 지워진다
 *  6. 위하고 = 참조: 사업자번호·대표자·담당 빈칸만 채움. 동명이면 생년 6자리·사업자번호 앞 5자리로 가리고, 못 가리면 연결 안 함
 *  7. 이체 거래처는 수기 등록(save_client). 인증·CSRF, 오류 원문 노출 X, audit_log, 1년치도 쿼리 한도 안에서
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module
import { onRequestGet, onRequestPost, cmsPeriod, lastClosedMonth, activeIn, normYm, ntsServiceKey, normLoose, nameKeys, stopReason, cmsKey } from './admin-bk-fees.js';

const KEY = 'test-admin-key';
const ORIGIN = 'https://sewmu-chatbot.pages.dev';
let d1: ReturnType<typeof createTestDb>['d1'];
let env: Record<string, unknown>;

function req(method: string, qs: string, body?: unknown, key = true, origin = true) {
  const url = ORIGIN + '/api/admin-bk-fees?' + qs + (key ? '&key=' + KEY : '');
  const h: Record<string, string> = origin ? { origin: ORIGIN } : {};
  return { env, request: { url, method, headers: { get: (k: string) => h[k.toLowerCase()] ?? null }, json: async () => body } };
}
async function get(qs: string) { const r = await onRequestGet(req('GET', qs)); return { status: r.status, body: await r.json() as any }; }
async function post(action: string, body: unknown, qs = '') {
  const r = await onRequestPost(req('POST', 'action=' + action + qs, body));
  return { status: r.status, body: await r.json() as any };
}
async function grid(view = 'active') { return (await get('action=grid&year=2026&view=' + view)).body; }
const byCms = (g: any, no: string) => g.rows.find((r: any) => r.cms === no);
const sym = (r: any) => r.cells.map((c: any) => c.s).join('');

/* 화면(toCmsMembers)이 보내는 모양 */
const mem = (no: string, name: string, o: Record<string, unknown> = {}) => ({
  member_no: no, member_name: name, pay_day: 25, amount: 110000, member_status: '신청완료', payer: '', can_withdraw: '출금가능',
  pay_type: '계좌', start_date: '2025-01-10', end_date: '9999-12-31', key: '', ...o,
});
const tx = (no: string, date: string, status = '출금성공', o: Record<string, unknown> = {}) =>
  ({ member_no: no, member_name: '', tx_date: date, amount: 110000, status, reason: '', method: 'CMS계좌', ...o });
/* 5월~10월 본출금(25일) 성공 */
const monthly = (no: string, from = 5, to = 10, o: Record<string, unknown> = {}) =>
  Array.from({ length: to - from + 1 }, (_, i) => tx(no, `2026-${String(from + i).padStart(2, '0')}-25`, '출금성공', o));

beforeEach(async () => {
  d1 = createTestDb().d1;
  env = { DB: d1, ADMIN_KEY: KEY };
  /* 2026-11-13 기준: 2026년은 10월까지 마감 (27일 전) */
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T03:00:00Z'));
  await get('action=grid&year=2026');   /* 스키마 lazy 생성 */
});
afterEach(() => { vi.useRealTimers(); });

describe('순수 규칙', () => {
  it('약정일을 모를 때 귀속월: 20일 이후 당월, 19일 이전 전월 (1월이면 전년 12월)', () => {
    expect(cmsPeriod('2026-03-25')).toBe('2026-03');
    expect(cmsPeriod('20260405')).toBe('2026-03');
    expect(cmsPeriod('2026-01-05')).toBe('2025-12');
    expect(cmsPeriod('')).toBeNull();
  });
  it('마감월: 지난해 12, 올해 27일 전이면 전월, 내년 0', () => {
    expect(lastClosedMonth(2025, new Date('2026-11-12T00:00:00Z'))).toBe(12);
    expect(lastClosedMonth(2026, new Date('2026-11-12T00:00:00Z'))).toBe(10);
    expect(lastClosedMonth(2026, new Date('2026-11-27T00:00:00Z'))).toBe(11);
    expect(lastClosedMonth(2027, new Date('2026-11-12T00:00:00Z'))).toBe(0);
  });
  it('기장 중이었나 — 계약 구간 + 중단~재개 사이 제외', () => {
    const ev = [{ kind: '중단', event_date: '2026-03-15' }, { kind: '재개', event_date: '2026-06-02' }];
    const b = { bk_start: '2026-01', bk_end: null };
    expect(['2026-03', '2026-04', '2026-05', '2026-06'].map((p) => activeIn(p, b, ev))).toEqual([true, false, false, true]);
    expect(activeIn('2025-12', b, [])).toBe(false);
    expect(activeIn('2026-07', { bk_start: null, bk_end: '2026-06' }, [])).toBe(false);
  });
  it('YYYY-MM 정리 · 이름 키 (괄호 안 이름도)', () => {
    expect(normYm('2026.3')).toBe('2026-03');
    expect(normYm('20260315')).toBe('2026-03');
    expect(normYm('9999-12-31')).toBe('9999-12');
    expect(normYm('x')).toBeNull();
    expect(normLoose('(주) 갑 상사')).toBe(normLoose('주식회사갑상사'));
    expect(nameKeys('옆커폰 옥정점[정희재]')).toEqual(expect.arrayContaining(['정희재']));
  });
  it('정지 사유 — 신청불능 / 결제종료 지남 / 출금불가 + 출금 기록 없음(결제조회 올렸을 때만)', () => {
    expect(stopReason({ cms_state: '신청불능' }, '2026-11')).toBe('CMS 신청불능');
    expect(stopReason({ cms_state: '신청완료', bk_end: '2026-08', bk_end_reason: 'CMS종료' }, '2026-11')).toBe('CMS종료 2026-08');
    expect(stopReason({ cms_state: '신청완료', bk_end: '2026-11' }, '2026-11')).toBe('');
    const blocked = { member_no: 'M1', cms_state: '신청완료', can_withdraw: '출금불가' };
    expect(stopReason(blocked, '2026-11', false)).toBe('출금불가 · 출금 기록 없음');
    expect(stopReason(blocked, '2026-11', true)).toBe('');
    expect(stopReason(blocked, '2026-11', undefined)).toBe('');
  });
});

describe('CMS 회원목록 = 거래처 명단', () => {
  it('회원번호마다 한 곳 — 진행 중 / 정지·해지 따로, 합계 줄·이상한 번호 제외', async () => {
    const r = (await post('import_cms_members', { rows: [
      mem('M0001', '갑상사'),
      mem('M0002', '을식당', { member_status: '신청불능' }),
      mem('M0003', '병카페', { end_date: '2026-08-31' }),
      mem('M0004', '정공업', { pay_type: '카드', end_date: '2026-11-30' }),
      { member_no: '합계', member_name: '합계' }, mem('X9', '이상'),
    ] })).body;
    expect(r).toMatchObject({ rows: 4, added: 4, updated: 0, active: 2, stopped: 2 });
    const a = await grid('active');
    expect(a.rows.map((x: any) => x.cms).sort()).toEqual(['M0001', 'M0004']);
    expect(byCms(a, 'M0004')).toMatchObject({ pay: 'CMS카드', fee: 110000, start: '2025-01', end: '2026-11', stopped: false });
    const s = await grid('stopped');
    expect(s.rows.map((x: any) => [x.cms, x.stop_reason])).toEqual(expect.arrayContaining([['M0002', 'CMS 신청불능'], ['M0003', 'CMS종료 2026-08']]));
    expect(a.total).toMatchObject({ active: 2, stopped: 2 });
    expect((await grid('all')).rows).toHaveLength(4);
    const au: any = await d1.prepare(`SELECT COUNT(*) n FROM audit_log WHERE action = 'bk_cms_members_import'`).first();
    expect(au.n).toBe(1);
  });
  it('다시 올리면: 금액·상태 최신, 시작월은 처음 값 유지, 결제종료가 9999 로 풀리면 종료 해제', async () => {
    await post('import_cms_members', { rows: [mem('M0001', '갑상사', { end_date: '2026-06-30', start_date: '2024-03-01' })] });
    const r = (await post('import_cms_members', { rows: [mem('M0001', '갑상사(변경)', { amount: 165000, start_date: '2026-02-01' })] })).body;
    expect(r).toMatchObject({ added: 0, updated: 1, active: 1, stopped: 0 });
    const c: any = await d1.prepare(`SELECT name, bill, bk_start, bk_end, bk_end_reason FROM bk_clients WHERE member_no = 'M0001'`).first();
    expect(c).toEqual({ name: '갑상사(변경)', bill: 165000, bk_start: '2024-03', bk_end: null, bk_end_reason: null });
  });
  it('사람이 넣은 해지 기록은 회원목록을 다시 올려도 안 지워진다', async () => {
    await post('import_cms_members', { rows: [mem('M0001', '갑상사')] });
    const id = byCms(await grid(), 'M0001').id;
    await post('event', { client_id: id, kind: '해지', event_date: '2026-07-10' });
    await post('import_cms_members', { rows: [mem('M0001', '갑상사')] });
    const c: any = await d1.prepare(`SELECT bk_end, bk_end_reason FROM bk_clients WHERE id = ?`).bind(id).first();
    expect(c).toEqual({ bk_end: '2026-07', bk_end_reason: '해지' });
    expect(byCms(await grid('stopped'), 'M0001').stop_reason).toBe('해지 2026-07');
  });
  it('출금불가인데 결제조회 기간 내내 출금 기록이 없으면 정지 쪽 / 기록이 있으면 진행 중 + ✕ 사유', async () => {
    await post('import_cms_members', { rows: [
      mem('M0001', '갑상사'),
      mem('M0002', '을식당', { can_withdraw: '출금불가' }),
      mem('M0003', '병카페', { can_withdraw: '출금불가' }),
    ] });
    /* 결제조회 전에는 판단하지 않는다 */
    expect((await grid('active')).rows).toHaveLength(3);
    await post('import_cms', { rows: [...monthly('M0001'), ...monthly('M0003', 5, 8)] });
    const a = await grid('active');
    expect(a.rows.map((x: any) => x.cms).sort()).toEqual(['M0001', 'M0003']);
    const b = byCms(a, 'M0003');
    expect(sym(b)).toBe('----ooooxx--');
    expect(b.cells[8].why).toBe('출금불가 — CMS 출금 시도 없음');
    expect(byCms(await grid('stopped'), 'M0002').stop_reason).toBe('출금불가 · 출금 기록 없음');
  });
});

describe('결제조회 · 카드 승인조회 → 월별 ○ ✕', () => {
  beforeEach(async () => {
    await post('import_cms_members', { rows: [
      mem('M0001', '갑상사'),
      mem('M0002', '을식당', { pay_day: 19 }),
      mem('M0003', '병카페', { pay_day: 1, start_date: '2026-05-02' }),
      mem('M0004', '정공업', { pay_type: '카드' }),
    ] });
  });
  it('약정일 25일: 25일 이후 출금 = 그 달, 다음 달 초·24일 재출금 = 전달 / 실패는 사유, 출금중은 ⋯', async () => {
    const r = (await post('import_cms', { rows: [
      ...monthly('M0001', 5, 7),
      tx('M0001', '2026-08-25', '출금실패', { reason: '잔액부족' }),
      tx('M0001', '2026-09-24', '재출금성공'),               /* 8월분 */
      tx('M0001', '2026-09-25', '출금실패', { reason: '잔액부족' }),
      tx('M0001', '2026-10-02', '재출금실패', { reason: '잔액부족' }),   /* 9월분 */
      tx('M0001', '2026-10-27', '출금중'),
    ] })).body;
    expect(r).toMatchObject({ saved: 8, duplicate: 0, success: 4, failed: 3, pending: 1, members_pending: false, unknown_members: [] });
    const g = byCms(await grid(), 'M0001');
    expect(sym(g)).toBe('----oooox-p-'.replace('-p-', 'p--'));
    expect(g.cells[7]).toMatchObject({ s: 'o', src: 'CMS', d: '2026-09-24' });
    expect(g.cells[8]).toMatchObject({ s: 'x', a: 110000, why: '재출금실패 · 잔액부족' });
    expect(g.cells[9]).toMatchObject({ s: 'p', why: '출금중' });
  });
  it('약정일 19일: 19~21일 출금이 모두 그 달 (주말 밀림) — 20일 기준이면 틀리는 곳', async () => {
    await post('import_cms', { rows: ['2026-05-19', '2026-06-19', '2026-07-20', '2026-08-19', '2026-09-21', '2026-10-19'].map((d) => tx('M0002', d)) });
    await post('import_cms', { rows: monthly('M0001') });
    expect(sym(byCms(await grid(), 'M0002'))).toBe('----oooooo--');
  });
  it('약정일 1일: 1일 이후 출금은 그 달 (9/1 출금 = 9월분)', async () => {
    await post('import_cms', { rows: [...monthly('M0001'), ...['2026-06-01', '2026-07-02', '2026-08-01', '2026-09-01', '2026-10-01'].map((d) => tx('M0003', d))] });
    expect(sym(byCms(await grid(), 'M0003'))).toBe('----xooooo--');
  });
  it('자료 범위: 4월분은 5월 초 재출금만 있어 ✕ 가 아니라 – / 카드는 카드 파일 범위로', async () => {
    await post('import_cms', { rows: [tx('M0001', '2026-05-06', '재출금실패', { reason: '잔액부족' }), ...monthly('M0001'),
      tx('M0003', '2026-11-02')] });   /* 약정일 1일 → 11월분이지만 11월은 아직 마감 전: 범위 끝은 10월 */
    await post('import_cms', { rows: [6, 7, 8, 9, 10].map((m) => tx('M0004', `2026-${String(m).padStart(2, '0')}-25`, '승인성공', { method: 'CMS카드' })) });
    const g = await grid();
    expect(g.coverage_by).toEqual({ 'CMS계좌': { from: '2026-05', to: '2026-10' }, 'CMS카드': { from: '2026-06', to: '2026-10' } });
    expect(byCms(g, 'M0001').cells[3]).toMatchObject({ s: '-', nodata: true });
    expect(sym(byCms(g, 'M0004'))).toBe('-----ooooo--');
    expect(byCms(g, 'M0004').cells[4]).toMatchObject({ s: '-', nodata: true });
  });
  it('회원목록보다 결제조회를 먼저 올려도 결과가 같다 (모르는 회원번호 경고 대신 "회원목록 올리면 반영")', async () => {
    const rows = [...monthly('M0001'), tx('M0001', '2026-08-25', '출금실패'), tx('M0002', '2026-05-19')];
    await post('import_cms', { rows });
    const one = (await grid('all')).rows.map((r: any) => [r.cms, sym(r)]);

    d1 = createTestDb().d1; env = { DB: d1, ADMIN_KEY: KEY };
    const first = (await post('import_cms', { rows })).body;
    expect(first).toMatchObject({ members_pending: true, unknown_members: [] });
    await post('import_cms_members', { rows: [
      mem('M0001', '갑상사'), mem('M0002', '을식당', { pay_day: 19 }),
      mem('M0003', '병카페', { pay_day: 1, start_date: '2026-05-02' }), mem('M0004', '정공업', { pay_type: '카드' }),
    ] });
    expect((await grid('all')).rows.map((r: any) => [r.cms, sym(r)])).toEqual(one);
  });
  it('같은 파일을 다시 올려도 안 쌓이고, 수기로 확인한 달은 그대로 / 회원목록 다시 올려도 ○ 유지', async () => {
    await post('import_cms', { rows: monthly('M0001', 5, 9) });
    const id = byCms(await grid(), 'M0001').id;
    await post('mark_paid', { client_id: id, period: '2026-10', paid_at: '2026-11-03', amount: 110000 });
    const again = (await post('import_cms', { rows: monthly('M0001', 5, 9) })).body;
    expect(again).toMatchObject({ saved: 0, duplicate: 5 });
    await post('import_cms_members', { rows: [mem('M0001', '갑상사')] });
    const g = byCms(await grid(), 'M0001');
    expect(sym(g)).toBe('----oooooo--');
    expect(g.cells[9]).toMatchObject({ src: '수기', d: '2026-11-03' });
  });
});

describe('입금확인 (수기)', () => {
  it('✕ → 입금확인 ○ → 해제 ✕, audit_log / CMS ○ 는 해제 안 됨 / 잘못된 값은 400', async () => {
    await post('import_cms_members', { rows: [mem('M0001', '갑상사'), mem('M0009', '자료범위용')] });
    await post('import_cms', { rows: [...monthly('M0001', 5, 8), ...monthly('M0009')] });
    const id = byCms(await grid(), 'M0001').id;
    expect(byCms(await grid(), 'M0001').cells[8].s).toBe('x');
    await post('mark_paid', { client_id: id, period: '2026-09', paid_at: '2026-10-02' });
    expect(byCms(await grid(), 'M0001').cells[8]).toMatchObject({ s: 'o', src: '수기', a: 110000 });
    await post('unmark_paid', { client_id: id, period: '2026-09' });
    await post('unmark_paid', { client_id: id, period: '2026-05' });
    expect(sym(byCms(await grid(), 'M0001'))).toBe('----ooooxx--');
    const au: any = await d1.prepare(`SELECT COUNT(*) n FROM audit_log WHERE action IN ('bk_mark_paid','bk_unmark_paid')`).first();
    expect(au.n).toBe(3);
    expect((await post('mark_paid', { client_id: id, period: '2026-9' })).status).toBe(200);
    expect((await post('mark_paid', { client_id: id, period: 'x' })).status).toBe(400);
    expect((await post('mark_paid', { client_id: id, period: '2026-09', paid_at: '10/2' })).status).toBe(400);
  });
});

describe('이체 거래처 — 수기 등록', () => {
  it('이름 + 기장료(부가세 포함)로 등록: 시작월부터 ✕, 입금확인하면 ○ / 이름·기장료 없으면 400', async () => {
    expect((await post('save_client', { name: '무기장' })).status).toBe(400);
    expect((await post('save_client', { bill: 110000 })).status).toBe(400);
    const r = (await post('save_client', { name: '이체상사', bill: '165,000', bk_start: '2026-09', staff_name: '담당C' })).body;
    expect(r.ok).toBe(true);
    const g = await grid();
    const row = g.rows.find((x: any) => x.id === r.id);
    expect(row).toMatchObject({ source: 'manual', pay: '직접이체', fee: 165000, start: '2026-09', staff: '담당C' });
    expect(sym(row)).toBe('--------xx--');
    expect(row.events.map((e: any) => e.kind)).toEqual(['수임']);
    await post('mark_paid', { client_id: r.id, period: '2026-09' });
    expect(sym((await grid()).rows.find((x: any) => x.id === r.id))).toBe('--------ox--');
  });
  it('중단(7월) → 재개(9월): 8월만 –, 앞 이력은 그대로', async () => {
    const { id } = (await post('save_client', { name: '이체상사', bill: 110000, bk_start: '2026-05' })).body;
    await post('mark_paid', { client_id: id, period: '2026-05' });
    await post('event', { client_id: id, kind: '중단', event_date: '2026-07-15' });
    await post('event', { client_id: id, kind: '재개', event_date: '2026-09-01' });
    expect(sym((await grid()).rows.find((x: any) => x.id === id))).toBe('----oxx-xx--');
    expect((await post('event', { client_id: id, kind: '아무거나' })).status).toBe(400);
    expect((await post('event', { client_id: id, kind: '해지', event_date: '7월' })).status).toBe(400);
  });
});

describe('위하고 명부 (참조)', () => {
  const wh = (bn: string, name: string, o: Record<string, unknown> = {}) => ({ business_number: bn, company_name: name, ceo_name: '', staff_name: '', birth6: '', ...o });
  it('이름이 같으면 사업자번호·대표자·담당을 빈칸만 채우고, admin 업체가 한 곳이면 연결', async () => {
    await d1.prepare(`INSERT INTO businesses (id, company_name, business_number) VALUES (11, '(주)갑상사', '101-81-00001')`).run();
    await post('import_cms_members', { rows: [mem('M0001', '(주)갑상사'), mem('M0002', '을식당')] });
    const id2 = byCms(await grid(), 'M0002').id;
    await post('save_client', { id: id2, staff_name: '내가넣은담당' });
    const r = (await post('import_wehago', { rows: [
      wh('101-81-00001', '주식회사 갑상사', { ceo_name: '홍길동', staff_name: '이직원' }),
      wh('201-00-00002', '을식당', { ceo_name: '김을순', staff_name: '김직원' }),
    ] })).body;
    expect(r).toMatchObject({ rows: 2, matched: 2, business_linked: 1, unmatched_count: 0, members_pending: false });
    const g = await grid();
    expect(byCms(g, 'M0001')).toMatchObject({ biz_no: '101-81-00001', ceo: '홍길동', staff: '이직원', business_id: 11 });
    expect(byCms(g, 'M0002')).toMatchObject({ biz_no: '201-00-00002', ceo: '김을순', staff: '내가넣은담당' });
  });
  it('같은 이름이 여럿이면 생년 6자리(개인)·사업자번호 앞 5자리(법인)로 가리고, 못 가리면 연결 안 함', async () => {
    await post('import_wehago', { rows: [
      wh('111-11-11111', '옆커폰 동남점', { birth6: '850101' }),
      wh('222-22-22222', '옆커폰 동남점', { birth6: '900202' }),
      wh('333-81-33333', '대백마트', {}), wh('444-81-44444', '대백마트', {}),
      wh('555-55-55555', '같은이름', {}), wh('666-66-66666', '같은이름', {}),
    ] });
    await post('import_cms_members', { rows: [
      mem('M0001', '옆커폰 동남점', { key: '900202' }),
      mem('M0002', '대백마트', { key: '44481' }),   /* 화면이 CMS 의 '44481*****' 를 잘라 보낸 값 */
      mem('M0003', '같은이름', { key: '' }),
    ] });
    const g = await grid();
    expect(byCms(g, 'M0001').biz_no).toBe('222-22-22222');
    expect(byCms(g, 'M0002').biz_no).toBe('444-81-44444');
    expect(byCms(g, 'M0003').biz_no).toBe('');
  });
  it('위하고에 폐업 표시된 곳은 표시만 (정지로 옮기지 않음) / 회원목록보다 먼저 올려도 됨', async () => {
    const first = (await post('import_wehago', { rows: [wh('101-81-00001', '[폐업]갑상사')] })).body;
    expect(first).toMatchObject({ matched: 0, members_pending: true });
    await post('import_cms_members', { rows: [mem('M0001', '갑상사')] });
    const r = byCms(await grid(), 'M0001');
    expect(r).toMatchObject({ wehago_closed: true, stopped: false, biz_no: '101-81-00001' });
  });
  it('생년 6자리 외의 값은 저장하지 않는다 (주민번호 뒷자리 등)', async () => {
    await post('import_wehago', { rows: [wh('101-81-00001', '갑', { birth6: '850101-1234567' }), wh('201-00-00002', '을', { birth6: '900202' })] });
    const { results }: any = await d1.prepare(`SELECT birth6 FROM bk_wehago ORDER BY business_number`).all();
    expect(results.map((x: any) => x.birth6)).toEqual([null, '900202']);
  });
});

describe('2바퀴 검토 반영', () => {
  it('CMS 생년월일/사업자번호 칸: 생년 6자리 · 사업자 앞 5자리만 — 주민번호 뒷자리는 가려져 있지 않아도 저장 안 함', async () => {
    expect(cmsKey('850101')).toBe('850101');
    expect(cmsKey('850101-1******')).toBe('850101');
    expect(cmsKey('850101-1234567')).toBe('850101');
    expect(cmsKey('8501011234567')).toBeNull();
    expect(cmsKey('101-81-00001')).toBe('10181');
    expect(cmsKey('10181*****')).toBe('10181');   /* 실제 CMS 파일 모양 */
    expect(cmsKey('10181')).toBe('10181');        /* 화면이 이미 잘라 보낸 값 */
    expect(cmsKey('')).toBeNull();
    await post('import_cms_members', { rows: [mem('M0001', '갑', { key: '850101-1234567' }), mem('M0002', '을', { key: '8501011234567' })] });
    const { results }: any = await d1.prepare(`SELECT cms_key FROM bk_clients ORDER BY member_no`).all();
    expect(results.map((x: any) => x.cms_key)).toEqual(['850101', null]);
  });
  it('약정일 1일 한 곳의 11/2 출금만으로 11월을 "자료 있음" 으로 보지 않는다 — 27일이 지나도 나머지는 ✕ 아닌 –', async () => {
    vi.setSystemTime(new Date('2026-11-28T03:00:00Z'));
    await post('import_cms_members', { rows: [mem('M0001', '갑'), mem('M0002', '을'), mem('M0003', '병', { pay_day: 1 })] });
    await post('import_cms', { rows: [...monthly('M0001'), ...monthly('M0002'), tx('M0003', '2026-10-01'), tx('M0003', '2026-11-02')] });
    const g = await grid();
    expect(g.coverage_by['CMS계좌']).toEqual({ from: '2026-05', to: '2026-10' });
    expect(byCms(g, 'M0001').cells[10]).toMatchObject({ s: '-', nodata: true });
    expect(byCms(g, 'M0003').cells[10]).toMatchObject({ s: 'o' });
  });
  it('업로드 결과 곳수 = 격자 곳수 (기본금액 0 인 회원은 둘 다 빼고 셈)', async () => {
    const r = (await post('import_cms_members', { rows: [mem('M0001', '갑'), mem('M0002', '을', { amount: 0 })] })).body;
    expect(r.active).toBe(1);
    expect((await grid()).total.active).toBe(1);
  });
  it('이체 입금은 기장 중이었고 아직 안 받은 가장 이른 달로 (10월분을 11/5 이체 → 10월)', async () => {
    const { id } = (await post('save_client', { name: '이체상사', bill: 110000, bk_start: '2026-09', ceo_name: '김대표' })).body;
    await post('mark_paid', { client_id: id, period: '2026-09' });
    const r = (await post('import_bank', { rows: [{ tx_date: '2026-11-05', amount: 110000, payer: '이체상사', memo: '' }] })).body;
    expect(r).toMatchObject({ saved: 1, matched: 1 });
    const row = (await grid()).rows.find((x: any) => x.id === id);
    expect(sym(row)).toBe('--------oo--');
    expect(row.cells[9]).toMatchObject({ src: '통장', d: '2026-11-05' });
  });
});

describe('국세청 폐업 체크 (사업자번호 있는 거래처)', () => {
  it('키가 없으면 안내, 폐업자면 폐업확인 기록만 (기장 종료는 안 건드림)', async () => {
    await post('import_cms_members', { rows: [mem('M0001', '갑상사'), mem('M0002', '을식당')] });
    await post('import_wehago', { rows: [
      { business_number: '101-81-00001', company_name: '갑상사' }, { business_number: '201-00-00002', company_name: '을식당' },
    ] });
    expect((await post('check_biz_status', {})).body.error).toContain('NTS_API_KEY');
    env.NTS_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [
      { b_no: '1018100001', b_stt: '폐업자', end_dt: '20260930' }, { b_no: '2010000002', b_stt: '계속사업자' },
    ] }) })));
    try {
      const r = (await post('check_biz_status', { limit: 100 })).body;
      expect(r.checked).toBe(2);
      expect(r.changed.map((c: any) => c.after).sort()).toEqual(['계속사업자', '폐업자']);
      const g = await grid();
      expect(byCms(g, 'M0001')).toMatchObject({ nts: '폐업자', end: '', stopped: false });
      expect(byCms(g, 'M0001').events).toEqual([expect.objectContaining({ kind: '폐업확인', event_date: '2026-09-30' })]);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('국세청 인증키 — Encoding·Decoding 아무거나', () => {
  it('Decoding 키(+ / = 그대로)는 한 번 인코딩, Encoding 키(%2B…)는 두 번 인코딩하지 않는다', () => {
    const dec = 'abc+def/ghi==';
    const enc = 'abc%2Bdef%2Fghi%3D%3D';
    expect(ntsServiceKey(dec)).toBe(enc);
    expect(ntsServiceKey(enc)).toBe(enc);
    expect(ntsServiceKey('  ' + enc + '\n')).toBe(enc);
    expect(ntsServiceKey('')).toBe('');
  });
  it('실제 호출 URL 에 serviceKey 가 한 번만 인코딩돼 들어가고, 401 이면 키 안내', async () => {
    await post('import_cms_members', { rows: [mem('M0001', '갑상사')] });
    await post('import_wehago', { rows: [{ business_number: '101-81-00001', company_name: '갑상사' }] });
    env.NTS_API_KEY = 'abc%2Bdef%3D%3D';
    let calledUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calledUrl = u; return { ok: false, status: 401, json: async () => ({}) }; }));
    try {
      const r = await post('check_biz_status', {});
      expect(calledUrl).toContain('serviceKey=abc%2Bdef%3D%3D');
      expect(calledUrl).not.toContain('%25');
      expect(r.body.error).toContain('키가 맞지 않습니다');
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('대용량 — 1년치 파일도 요청 하나의 쿼리 한도(1,000) 안에서', () => {
  /* D1 왕복 횟수 세기: prepare(...).run/all/first 1번 = 1, batch 1번 = 1 */
  function counting(db: any) {
    let n = 0, inBatch = false;
    const wrap = (st: any): any => new Proxy(st, { get(t, k) {
      if (k === 'bind') return (...a: unknown[]) => wrap(t.bind(...a));
      if (k === 'run' || k === 'all' || k === 'first') return (...a: unknown[]) => { if (!inBatch) n++; return t[k](...a); };
      const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
    } });
    const proxied = new Proxy(db, { get(t, k) {
      if (k === 'prepare') return (sql: string) => wrap(t.prepare(sql));
      /* 테스트 DB 의 batch 는 문장마다 run 을 부른다 — D1 처럼 batch 1번 = 왕복 1번으로 센다 */
      if (k === 'batch') return async (stmts: any[]) => { n++; inBatch = true; try { return await t.batch(stmts); } finally { inBatch = false; } };
      const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
    } });
    return { db: proxied, count: () => n };
  }
  it('회원 300곳 · 결제조회 3,000줄 · 위하고 1,200곳 — 각각 왕복 150번 이하, 결과는 그대로', async () => {
    const c = counting(d1);
    env = { DB: c.db, ADMIN_KEY: KEY };
    const members = Array.from({ length: 300 }, (_, i) => mem('M' + (5000 + i), '대량' + i + '상사'));
    let before = c.count();
    expect((await post('import_cms_members', { rows: members })).body).toMatchObject({ added: 300, active: 300 });
    expect(c.count() - before).toBeLessThan(150);

    const rows = [];
    for (let i = 0; i < 300; i++) for (let mo = 1; mo <= 10; mo++) rows.push(tx('M' + (5000 + i), `2026-${String(mo).padStart(2, '0')}-25`));
    before = c.count();
    expect((await post('import_cms', { rows })).body).toMatchObject({ saved: 3000, success: 3000 });
    expect(c.count() - before).toBeLessThan(150);

    const wrows = Array.from({ length: 1200 }, (_, i) => ({ business_number: `${100 + (i % 800)}-${String(10 + (i % 80)).padStart(2, '0')}-${String(10000 + i)}`, company_name: '대량' + i + '상사' }));
    before = c.count();
    expect((await post('import_wehago', { rows: wrows })).body.matched).toBe(300);
    expect(c.count() - before).toBeLessThan(150);

    const g = (await get('action=grid&year=2026')).body;
    expect(g.rows).toHaveLength(300);
    expect(g.rows.every((x: any) => x.cells.slice(0, 10).every((cc: any) => cc.s === 'o'))).toBe(true);
  }, 30000);
});

describe('인증·보안', () => {
  it('키 없으면 401, Origin 없는 POST(키 없이)는 CSRF 403', async () => {
    expect((await onRequestGet(req('GET', 'action=grid', undefined, false))).status).toBe(401);
    expect((await onRequestPost(req('POST', 'action=mark_paid', { client_id: 1, period: '2026-03' }, false, false))).status).toBe(403);
  });
  it('DB 오류여도 원문 대신 일반 문구', async () => {
    const broken = { prepare: () => { throw new Error('SQLITE_ERROR: secret detail'); }, batch: () => { throw new Error('secret'); } };
    env = { DB: broken, ADMIN_KEY: KEY };
    const r = await onRequestGet(req('GET', 'action=grid'));
    const b = await r.json() as any;
    expect(r.status).toBe(500);
    expect(JSON.stringify(b)).not.toContain('secret');
  });
});
