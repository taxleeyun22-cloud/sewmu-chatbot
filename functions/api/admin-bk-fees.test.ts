/**
 * 기장료 수납 (/api/admin-bk-fees) — 사장님 2026-11-12:
 *   "거래처 깔아놓고 입금 됐다 안 됐다만 확인. 통장 거래내역이랑 CMS 입금내역이랑."
 *   "기장이 들어왔다, 언제 들어왔다, 이거 안됐다, 폐업됐다, 이것도 체크할 수 있도록."
 *
 * 지키는 것:
 *  1. 격자: 계약 전·후·중단 기간은 '–', 마감 안 된 달은 '–', 나머지는 입금 ○ / 미입금 ✕
 *  2. 중단 → 재개 해도 그 전 달들의 이력이 사라지지 않는다
 *  3. CMS: 출금일로 귀속월(20일 이후 당월·19일 이전 전월), 성공만 수납, 같은 파일 다시 올려도 안 쌓임
 *  4. 통장: 금액 + 입금자명 둘 다 맞고 한 곳일 때만 자동 매칭. 입금자명 빈칸이면 금액만으로 붙지 않음. 집금 제외
 *  5. 마스터: 있는 거래처만 UPDATE (새로 만들지 않음), 미리보기는 아무것도 안 바꿈
 *  6. 국세청 '폐업자' → 폐업확인 이벤트 (기장 종료는 사람이)
 *  7. 지운 거래처 제외, 인증·CSRF, 오류 원문 노출 X, 돈 관련 동작 audit_log
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module
import { onRequestGet, onRequestPost, cmsPeriod, lastClosedMonth, activeIn, normYm } from './admin-bk-fees.js';

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
async function biz(id: number, f: Record<string, unknown>) {
  const cols = ['id', ...Object.keys(f)];
  await d1.prepare(`INSERT INTO businesses (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(id, ...Object.values(f)).run();
}
const row = (g: any, id: number) => g.rows.find((r: any) => r.id === id);
const sym = (r: any) => r.cells.map((c: any) => c.s).join('');

beforeEach(async () => {
  d1 = createTestDb().d1;
  env = { DB: d1, ADMIN_KEY: KEY };
  /* 2026-11-12 기준: 2026년은 10월까지 마감 (27일 전) */
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T03:00:00Z'));
  await biz(1, { company_name: '(주)갑', ceo_name: '홍길동', business_number: '1018100001' });
  await biz(2, { company_name: '을식당', ceo_name: '김을순', business_number: '2010000002' });
  await biz(3, { company_name: '병카페', ceo_name: '박병철' });
  await biz(4, { company_name: '지운상사', ceo_name: '최지운', deleted_at: '2026-01-01' });
  await get('action=grid&year=2026');   /* 스키마 lazy 생성 */
  await d1.prepare(`UPDATE businesses SET monthly_fee = 100000, cms_member_no = 'M001', staff_name = '담당A', bk_start = '2025-01' WHERE id = 1`).run();
  await d1.prepare(`UPDATE businesses SET monthly_fee = 150000, staff_name = '담당B', bk_start = '2026-04' WHERE id = 2`).run();
  await d1.prepare(`UPDATE businesses SET monthly_fee = 100000, staff_name = '담당A' WHERE id = 3`).run();
  await d1.prepare(`UPDATE businesses SET monthly_fee = 100000 WHERE id = 4`).run();
});
afterEach(() => { vi.useRealTimers(); });

describe('순수 규칙', () => {
  it('CMS 귀속월: 20일 이후 당월, 19일 이전 전월 (1월이면 전년 12월)', () => {
    expect(cmsPeriod('2026-03-25')).toBe('2026-03');
    expect(cmsPeriod('20260405')).toBe('2026-03');
    expect(cmsPeriod('2026-01-05')).toBe('2025-12');
    expect(cmsPeriod('2026-04-20')).toBe('2026-04');
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
  it('YYYY-MM 정리', () => {
    expect(normYm('2024.3')).toBe('2024-03');
    expect(normYm('2024-03-01')).toBe('2024-03');
    expect(normYm('202403')).toBe('2024-03');
    expect(normYm('2024-13')).toBeNull();
    expect(normYm('삼월')).toBeNull();
  });
});

describe('격자', () => {
  it('기장 시작 전은 –, 마감 안 된 11·12월은 –, 나머지는 ✕ / 지운 거래처는 안 나옴', async () => {
    const g = (await get('action=grid&year=2026')).body;
    expect(g.lastClosed).toBe(10);
    expect(sym(row(g, 1))).toBe('xxxxxxxxxx--');
    expect(sym(row(g, 2))).toBe('---xxxxxxx--');
    expect(row(g, 1).fee).toBe(110000);
    expect(row(g, 4)).toBeUndefined();
    expect(g.total).toMatchObject({ biz: 3, openBiz: 3 });
  });
  it('입금확인 ○ → 해제 ✕ (수기), 금액·입금일 기록, audit_log', async () => {
    expect((await post('mark_paid', { business_id: 1, period: '2026-03', paid_at: '2026-03-30' })).body.ok).toBe(true);
    let c = row((await get('action=grid&year=2026')).body, 1).cells[2];
    expect(c).toMatchObject({ s: 'o', d: '2026-03-30', a: 110000, src: '수기' });
    await post('unmark_paid', { business_id: 1, period: '2026-03' });
    c = row((await get('action=grid&year=2026')).body, 1).cells[2];
    expect(c.s).toBe('x');
    const a = (await d1.prepare(`SELECT action FROM audit_log ORDER BY id`).all()).results!.map((x: any) => x.action);
    expect(a).toEqual(['bk_mark_paid', 'bk_unmark_paid']);
  });
  it('잘못된 귀속월·날짜는 400', async () => {
    expect((await post('mark_paid', { business_id: 1, period: '3월' })).status).toBe(400);
    expect((await post('mark_paid', { business_id: 1, period: '2026-03', paid_at: '3/30' })).status).toBe(400);
  });
});

describe('수임·중단·재개·폐업 기록', () => {
  it('중단(3월) → 재개(6월): 4·5월만 –, 그 전 입금 이력은 그대로', async () => {
    await post('mark_paid', { business_id: 1, period: '2026-02' });
    await post('event', { business_id: 1, kind: '중단', event_date: '2026-03-10' });
    await post('event', { business_id: 1, kind: '재개', event_date: '2026-06-01' });
    const r = row((await get('action=grid&year=2026')).body, 1);
    expect(sym(r)).toBe('xox--xxxxx--');   /* 3월(중단 달)까지 청구, 4·5월 –, 6월 재개부터 다시 */
    const b: any = await d1.prepare(`SELECT bk_start, bk_end FROM businesses WHERE id = 1`).first();
    expect(b).toEqual({ bk_start: '2025-01', bk_end: null });   /* 재개가 시작월을 덮어쓰지 않음 */
  });
  it('폐업(7월): 8월부터 –, bk_end·사유 기록', async () => {
    await post('event', { business_id: 2, kind: '폐업', event_date: '2026-07-20', memo: '대표 연락' });
    const r = row((await get('action=grid&year=2026')).body, 2);
    expect(sym(r)).toBe('---xxxx-----');
    expect(r).toMatchObject({ end: '2026-07', end_reason: '폐업' });
    expect(r.events[0]).toMatchObject({ kind: '폐업', memo: '대표 연락' });
  });
  it('허용 안 된 구분·날짜 형식은 400', async () => {
    expect((await post('event', { business_id: 1, kind: '삭제' })).status).toBe(400);
    expect((await post('event', { business_id: 1, kind: '중단', event_date: '2026/03/10' })).status).toBe(400);
  });
});

describe('CMS 출금결과', () => {
  const rows = [
    { member_no: 'M001', member_name: '갑', tx_date: '2026-03-25', amount: 110000, status: '출금성공' },
    { member_no: 'M001', member_name: '갑', tx_date: '2026-04-27', amount: 110000, status: '출금실패', reason: '잔액부족' },
    { member_no: 'M001', member_name: '갑', tx_date: '2026-05-06', amount: 110000, status: '재출금성공' },
    { member_no: 'M999', member_name: '모름', tx_date: '2026-03-25', amount: 55000, status: '출금성공' },
  ];
  it('성공만 수납, 재출금은 전월분, 모르는 회원번호는 알려줌', async () => {
    const r = (await post('import_cms', { rows, source_file: 'cms.xlsx' })).body;
    expect(r).toMatchObject({ saved: 4, duplicate: 0, paid: 2 });
    expect(r.unknown_members).toEqual(['M999 / 모름']);
    const cells = row((await get('action=grid&year=2026')).body, 1).cells;
    expect(cells[2]).toMatchObject({ s: 'o', src: 'CMS', d: '2026-03-25' });
    expect(cells[3]).toMatchObject({ s: 'o', src: 'CMS', d: '2026-05-06' });   /* 5/6 재출금 = 4월분 */
  });
  it('같은 파일을 다시 올려도 안 쌓이고, 이미 수기로 확인한 달은 그대로', async () => {
    await post('mark_paid', { business_id: 1, period: '2026-03', paid_at: '2026-03-20' });
    await post('import_cms', { rows });
    const again = (await post('import_cms', { rows })).body;
    expect(again).toMatchObject({ saved: 0, duplicate: 4 });
    const c: any = await d1.prepare(`SELECT COUNT(*) n FROM bk_cms_tx`).first();
    expect(c.n).toBe(4);
    const cell = row((await get('action=grid&year=2026')).body, 1).cells[2];
    expect(cell).toMatchObject({ src: '수기', d: '2026-03-20' });
  });
});

describe('통장 거래내역', () => {
  it('금액 + 입금자명(상호·대표자)이 맞고 한 곳이면 붙인다 — 가장 오래된 미납 달에', async () => {
    await d1.prepare(`INSERT INTO bk_fee_ledger (business_id, period, amount) VALUES (2, '2026-04', 165000), (2, '2026-05', 165000)`).run();
    const r = (await post('import_bank', { rows: [{ tx_date: '2026.05.10 14:00', amount: '165,000', payer: '김을순' }] })).body;
    expect(r).toMatchObject({ saved: 1, matched: 1 });
    const cells = row((await get('action=grid&year=2026')).body, 2).cells;
    expect(cells[3]).toMatchObject({ s: 'o', src: '통장', d: '2026-05-10' });
    expect(cells[4].s).toBe('x');
  });
  it('입금자명이 비면 금액만으로 붙이지 않는다 (확인 필요)', async () => {
    const r = (await post('import_bank', { rows: [{ tx_date: '2026-05-10', amount: 165000, payer: '' }] })).body;
    expect(r).toMatchObject({ matched: 0 });
    expect(r.review).toHaveLength(1);
  });
  it('금액이 같은 곳이 둘이면 이름이 겹쳐도 안 붙인다 / 집금·출금은 건너뜀 / 다시 올려도 안 쌓임', async () => {
    /* 갑(id1)·병카페(id3) 둘 다 대표 홍길동, 월 청구 110,000원 */
    await d1.prepare(`UPDATE businesses SET ceo_name = '홍길동' WHERE id = 3`).run();
    const rows = [
      { tx_date: '2026-05-10', amount: 110000, payer: '홍길동' },
      { tx_date: '2026-05-25', amount: 3_000_000, payer: 'CMS집금' },
      { tx_date: '2026-05-26', amount: 0, payer: '출금' },
    ];
    const r = (await post('import_bank', { rows })).body;
    expect(r).toMatchObject({ saved: 1, matched: 0 });
    expect((await post('import_bank', { rows })).body.saved).toBe(0);
  });
});

describe('기장료 마스터', () => {
  const rows = [
    { company_name: '을식당', ceo_name: '김을순', business_number: '201-00-00002', monthly_fee: '200,000', staff_name: '담당C', bk_start: '2026.2' },
    { company_name: '없는상사', ceo_name: '나없음', monthly_fee: 50000 },
    { company_name: '지운상사', monthly_fee: 50000 },
  ];
  it('미리보기는 아무것도 안 바꾸고, 지운 거래처·없는 거래처는 못 찾음', async () => {
    const r = (await post('import_master', { rows }, '&mode=preview&year=2026')).body;
    expect(r).toMatchObject({ matched_count: 1, unmatched_count: 2 });
    expect(r.matched[0]).toMatchObject({ business_id: 2, how: '사업자번호', bk_start: '2026-02', monthly_fee: 200000 });
    const b: any = await d1.prepare(`SELECT monthly_fee FROM businesses WHERE id = 2`).first();
    expect(b.monthly_fee).toBe(150000);
  });
  it('확정: 있는 거래처만 UPDATE + 시작월~마감월 청구 행, 새 거래처는 안 만든다', async () => {
    const before: any = await d1.prepare(`SELECT COUNT(*) n FROM businesses`).first();
    const r = (await post('import_master', { rows }, '&mode=commit&year=2026')).body;
    expect(r).toMatchObject({ updated: 1, ledger_rows: 9 });   /* 2월~10월 */
    const after: any = await d1.prepare(`SELECT COUNT(*) n FROM businesses`).first();
    expect(after.n).toBe(before.n);
    const b: any = await d1.prepare(`SELECT monthly_fee, staff_name, bk_start FROM businesses WHERE id = 2`).first();
    expect(b).toEqual({ monthly_fee: 200000, staff_name: '담당C', bk_start: '2026-02' });
    expect((await d1.prepare(`SELECT action FROM audit_log`).first() as any).action).toBe('bk_master_import');
  });
});

describe('국세청 폐업 체크', () => {
  it('키가 없으면 안내, 폐업자면 폐업확인 이벤트만 (기장 종료는 안 건드림)', async () => {
    expect((await post('check_biz_status', {})).body.error).toContain('NTS_API_KEY');
    env.NTS_API_KEY = 'k';
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [
      { b_no: '1018100001', b_stt: '폐업자', end_dt: '20260930' },
      { b_no: '2010000002', b_stt: '계속사업자' },
    ] }) }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const r = (await post('check_biz_status', { limit: 100 })).body;
      expect(r.checked).toBe(2);
      expect(r.changed.map((c: any) => c.after)).toEqual(['폐업자', '계속사업자']);
      const ev: any = await d1.prepare(`SELECT business_id, kind, event_date FROM bk_events`).all();
      expect(ev.results).toEqual([{ business_id: 1, kind: '폐업확인', event_date: '2026-09-30' }]);
      const b: any = await d1.prepare(`SELECT bk_end, nts_status FROM businesses WHERE id = 1`).first();
      expect(b).toEqual({ bk_end: null, nts_status: '폐업자' });
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('인증·보안', () => {
  it('키 없으면 401, Origin 없는 POST(키 없이)는 CSRF 403', async () => {
    expect((await onRequestGet(req('GET', 'action=grid', undefined, false))).status).toBe(401);
    expect((await onRequestPost(req('POST', 'action=mark_paid', { business_id: 1, period: '2026-03' }, false, false))).status).toBe(403);
  });
  it('DB 오류여도 원문 대신 일반 문구', async () => {
    const broken = { prepare: () => { throw new Error('SQLITE_ERROR: secret detail'); } };
    env = { DB: broken, ADMIN_KEY: KEY };
    const r = await onRequestGet(req('GET', 'action=grid'));
    const b = await r.json() as any;
    expect(r.status).toBe(500);
    expect(JSON.stringify(b)).not.toContain('secret');
  });
});
