/**
 * 거래처 매칭 2차 자동 검증 — 사장님 2026-10-20:
 *   "A 가 갑을병정 4개 사업체 (갑을 법인, 병정 개인) … 매칭이 확실하게 돼야. 위하고랑 엮어서 2차 검증까지 자동화."
 *   "위하고에 법인 대표이사 주민등록번호 들어가 있지. 자동 연결은 하지 말고 내 버튼은 있어야."
 *
 * 여기서 지키는 것:
 *  1. 고객이 적은 실명·생년월일·휴대폰·사업자번호 하나로 위하고의 같은 사람과 그 사람의 사업장 전부를 찾는다
 *  2. 사업장마다 근거·등급 (이름+생년월일 = 확실, 이름+다른 근거 = 유력, 나머지 = 확인 필요)
 *  3. 동명이인(생년월일 다름)은 후보에서 빠지고, 남의 사업장은 안 딸려 온다
 *  4. 아무것도 자동으로 안 바뀐다 — 가입 저장도, 카톡 로그인도, 매칭 조회도 승인 상태·연결을 건드리지 않는다
 *  5. 위하고 가져오기: 법인 대표 생년월일을 브라우저에서 뽑아 보내고, 서버는 그걸로 동명이인 대표를 가른다
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { findMatchCandidates, normBirth, gradeOf } from './_client-match.js';
// @ts-expect-error — JS module
import { onRequestGet as matchGet } from './admin-client-match.js';
// @ts-expect-error — JS module
import { onRequestPost as confirmName } from './auth/confirm-name.js';
// @ts-expect-error — JS module
import { onRequestGet as kakaoGet } from './auth/kakao.js';
// @ts-expect-error — JS module
import { createState } from './auth/_oauthState.js';
// @ts-expect-error — JS module
import { onRequestPost as importPost } from './admin-bulk-import-clients.js';

const KEY = 'test-admin-key';
type AnyDb = ReturnType<typeof createTestDb>['d1'];
let d1: AnyDb;

async function user(id: number, f: Record<string, unknown>) {
  const cols = ['id', ...Object.keys(f)], vals = [id, ...Object.values(f)];
  await d1.prepare(`INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...vals).run();
}
async function biz(id: number, f: Record<string, unknown>) {
  const cols = ['id', ...Object.keys(f)], vals = [id, ...Object.values(f)];
  await d1.prepare(`INSERT INTO businesses (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...vals).run();
}
async function link(b: number, u: number, role = '대표자', extra: Record<string, unknown> = {}) {
  const cols = ['business_id', 'user_id', 'role', ...Object.keys(extra)], vals = [b, u, role, ...Object.values(extra)];
  await d1.prepare(`INSERT INTO business_members (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...vals).run();
}

beforeEach(async () => {
  d1 = createTestDb().d1;
  /* 위하고에서 가져온 대표 "홍길동" (manual) — 갑·을 법인, 병·정 개인 */
  await user(100, { real_name: '홍길동', name: '홍길동', provider: 'manual', provider_id: 'manual:wehago:i:홍길동:1972-04-20', approval_status: 'approved_client', birth_date: '1972-04-20', phone: '010-1111-2222' });
  await biz(1, { company_name: '(주)갑', business_number: '1018100001', corporate_number: '1101110000001', company_form: '0.법인사업자', ceo_name: '홍길동', phone: '053-000-0001' });
  await biz(2, { company_name: '을주식회사', business_number: '1018100002', corporate_number: '1101110000002', company_form: '0.법인사업자', ceo_name: '홍길동' });
  await biz(3, { company_name: '병식당', business_number: '2010000003', company_form: '1.개인사업자', ceo_name: '홍길동', phone: '010-1111-2222' });
  await biz(4, { company_name: '정카페', business_number: '2010000004', company_form: '2.간이사업자', ceo_name: '홍길동', status: 'closed', closed_date: '2026-03-31' });
  await biz(5, { company_name: '(주)갑 대구지점', business_number: '1018100005', corporate_number: '1101110000001', company_form: '0.법인사업자', ceo_name: '홍길동', parent_business_id: 1 });
  for (const b of [1, 2, 3, 4]) await link(b, 100);
  /* 동명이인 홍길동 (생년월일 다름) — 무관상사 */
  await user(200, { real_name: '홍길동', name: '홍길동', provider: 'manual', approval_status: 'approved_client', birth_date: '1985-01-01' });
  await biz(9, { company_name: '무관상사', business_number: '3010000009', company_form: '1.개인사업자', ceo_name: '홍길동' });
  await link(9, 200);
  /* 갑의 경리 (담당자) */
  await user(300, { real_name: '김경리', name: '김경리', provider: 'manual', approval_status: 'approved_client' });
  await link(1, 300, '담당자');
  /* 방금 카톡으로 들어온 사람 (pending) */
  await user(500, { real_name: '홍길동', name: '길동이', provider: 'kakao', provider_id: 'k500', approval_status: 'pending', phone: '010-1111-2222' });
});

describe('매칭 엔진', () => {
  const claims = { real_name: '홍길동', birth_date: '1972-04-20', phone: '010-1111-2222', business_number: '201-00-00003' };

  it('병식당 번호 하나로 홍길동(1972)의 갑·을·병·정 + 갑 지점을 찾고, 동명이인의 무관상사는 안 딸려 온다', async () => {
    const r = await findMatchCandidates(d1, claims, 500);
    expect(r.claims_ok).toBe(true);
    expect(r.entered).toMatchObject({ id: 3, company_name: '병식당' });
    expect(r.persons.map((p: any) => p.user_id)).toEqual([100]);
    expect(r.persons[0]).toMatchObject({ birth_match: true, phone_match: true });
    expect(r.notes.join(' ')).toContain('동명이인');
    const ids = r.businesses.map((b: any) => b.business_id).sort();
    expect(ids).toEqual([1, 2, 3, 4]);
    expect(ids).not.toContain(9);
  });

  it('사업장별 등급: 이름+생년월일 맞는 대표 사업장은 확실, 법인·개인·폐업 구분', async () => {
    const r = await findMatchCandidates(d1, claims, 500);
    const by = Object.fromEntries(r.businesses.map((b: any) => [b.business_id, b]));
    expect(by[1]).toMatchObject({ form: '법인', grade: 'sure', suggested_role: '대표자' });
    expect(by[2]).toMatchObject({ form: '법인', grade: 'sure' });
    expect(by[3]).toMatchObject({ form: '개인', grade: 'sure' });
    expect(by[3].evidence).toMatchObject({ biz_no: true, name: true, birth: true, phone: true });
    expect(by[4]).toMatchObject({ form: '간이', closed: true, grade: 'sure' });
  });

  it('법인 번호를 적으면 같은 법인번호의 지점도 후보 — 지점은 대표 연결이 없어 이름+같은 법인번호 = 유력', async () => {
    const r = await findMatchCandidates(d1, { ...claims, business_number: '1018100001' }, 500);
    const by = Object.fromEntries(r.businesses.map((b: any) => [b.business_id, b]));
    expect(by[5]).toMatchObject({ branch: true, grade: 'likely' });
    expect(by[5].evidence).toMatchObject({ corp_group: true, name: true, birth: false });
    /* 확실이 먼저 정렬 */
    expect(r.businesses[r.businesses.length - 1].grade).not.toBe('sure');
  });

  it('생년월일이 틀리면 위하고 사람과 안 맞아 확실이 하나도 없다', async () => {
    const r = await findMatchCandidates(d1, { ...claims, birth_date: '1972-04-21' }, 500);
    expect(r.businesses.some((b: any) => b.grade === 'sure')).toBe(false);
  });

  it('경리(대표가 아닌 사람)가 갑 번호를 적으면 갑은 확인 필요 + 담당자 제안, 홍길동의 다른 사업장은 안 딸려 온다', async () => {
    const r = await findMatchCandidates(d1, { real_name: '김경리', birth_date: '1990-02-02', phone: '010-9999-9999', business_number: '1018100001' }, 999);
    const ids = r.businesses.map((b: any) => b.business_id).sort();
    expect(ids).toEqual([1, 5]);            /* 갑 + 같은 법인번호 지점만 */
    const gap = r.businesses.find((b: any) => b.business_id === 1);
    expect(gap).toMatchObject({ grade: 'check', suggested_role: '담당자' });
  });

  it('없는 사업자번호면 메모가 남고, 이름이 같은 대표 후보로는 찾는다', async () => {
    const r = await findMatchCandidates(d1, { ...claims, business_number: '9999999999' }, 500);
    expect(r.entered).toBeNull();
    expect(r.notes.join(' ')).toContain('목록에 없습니다');
    expect(r.businesses.map((b: any) => b.business_id).sort()).toEqual([1, 2, 3, 4]);
  });

  it('다른 카톡 계정이 이미 붙어 있으면 알려준다', async () => {
    await user(600, { real_name: '홍길동', name: 'gd', provider: 'kakao', provider_id: 'k600', approval_status: 'approved_client' });
    await link(2, 600, '대표자');
    const r = await findMatchCandidates(d1, claims, 500);
    expect(r.businesses.find((b: any) => b.business_id === 2).already_linked_kakao).toEqual(['홍길동']);
  });

  it('normBirth · gradeOf', () => {
    expect(normBirth('19720420')).toBe('1972-04-20');
    expect(normBirth('1972-04-20')).toBe('1972-04-20');
    expect(normBirth('19720230')).toBeNull();
    expect(normBirth('720420')).toBeNull();
    expect(normBirth('29990101')).toBeNull();
    expect(gradeOf({ name: true, birth: true })).toBe('sure');
    expect(gradeOf({ name: true, phone: true })).toBe('likely');
    expect(gradeOf({ name: false, birth: true, phone: true, biz_no: true })).toBe('check');
  });

  it('엔진은 아무것도 바꾸지 않는다', async () => {
    const before = await d1.prepare(`SELECT COUNT(*) c FROM business_members`).first();
    await findMatchCandidates(d1, claims, 500);
    const after = await d1.prepare(`SELECT COUNT(*) c FROM business_members`).first();
    expect(after).toEqual(before);
    expect((await d1.prepare(`SELECT approval_status FROM users WHERE id = 500`).first() as any).approval_status).toBe('pending');
  });
});

describe('GET /api/admin-client-match', () => {
  const get = async (qs: string, key = true) => {
    const req = { url: 'https://sewmu-chatbot.pages.dev/api/admin-client-match?' + qs + (key ? '&key=' + KEY : ''), method: 'GET', headers: { get: () => null } };
    const r = await matchGet({ env: { DB: d1, ADMIN_KEY: KEY }, request: req });
    return { status: r.status, body: await r.json() as any };
  };
  it('키 없으면 401', async () => {
    expect((await get('user_id=500', false)).status).toBe(401);
  });
  it('가입 때 적은 값으로 후보를 주되 생년월일 값은 안 싣는다', async () => {
    await d1.prepare(`ALTER TABLE users ADD COLUMN claim_birth_date TEXT`).run();
    await d1.prepare(`ALTER TABLE users ADD COLUMN claim_business_number TEXT`).run();
    await d1.prepare(`UPDATE users SET claim_birth_date = '1972-04-20', claim_business_number = '2010000003' WHERE id = 500`).run();
    const r = await get('user_id=500');
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ id: 500, has_birth: true, claim_business_number: '2010000003' });
    expect(r.body.businesses.length).toBe(4);
    expect(JSON.stringify(r.body)).not.toContain('1972-04-20');
  });
  it('없는 사용자 404, user_id 없으면 400', async () => {
    expect((await get('user_id=12345')).status).toBe(404);
    expect((await get('x=1')).status).toBe(400);
  });
});

describe('가입 저장 (confirm-name)', () => {
  async function post(body: unknown, uid = 500) {
    await d1.prepare(`INSERT OR IGNORE INTO sessions (token, user_id, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')`).bind('tok' + uid, uid).run();
    const req = { url: 'https://sewmu-chatbot.pages.dev/api/auth/confirm-name', method: 'POST', headers: { get: (k: string) => (k.toLowerCase() === 'cookie' ? 'session=tok' + uid : null) }, json: async () => body };
    const r = await confirmName({ env: { DB: d1 }, request: req });
    return { status: r.status, body: await r.json() as any };
  }
  it('기장거래처는 생년월일·사업자번호가 없으면 거절', async () => {
    expect((await post({ real_name: '홍길동', phone: '01011112222', user_type: 'client' })).body.error).toContain('생년월일');
    expect((await post({ real_name: '홍길동', phone: '01011112222', user_type: 'client', birth_date: '19720420', business_number: '123' })).body.error).toContain('사업자등록번호');
  });
  it('저장하면 claim_* 에 남고 승인 대기 그대로 — 명단과 전화가 같아도 자동 승인 안 함', async () => {
    await d1.prepare(`CREATE TABLE unbound_client_profiles (id INTEGER PRIMARY KEY, phone TEXT, company_name TEXT, business_number TEXT, matched_user_id INTEGER)`).run();
    await d1.prepare(`INSERT INTO unbound_client_profiles (phone, company_name) VALUES ('010-1111-2222', '병식당')`).run();
    const r = await post({ real_name: '홍길동', phone: '010-1111-2222', user_type: 'client', birth_date: '19720420', business_number: '201-00-00003' });
    expect(r.body).toMatchObject({ ok: true, approval_status: 'pending', auto_matched: false });
    const u: any = await d1.prepare(`SELECT approval_status, claim_birth_date, claim_business_number, declared_client FROM users WHERE id = 500`).first();
    expect(u).toMatchObject({ approval_status: 'pending', claim_birth_date: '1972-04-20', claim_business_number: '2010000003', declared_client: 1 });
  });
  it('이미 기장거래처 승인된 사람이 다시 저장해도 승인 상태는 그대로', async () => {
    await d1.prepare(`UPDATE users SET approval_status = 'approved_client' WHERE id = 500`).run();
    const r = await post({ real_name: '홍길동', phone: '010-1111-2222', user_type: 'guest' });
    expect(r.body.approval_status).toBe('approved_client');
  });
});

describe('카톡 로그인 — 거래처 계정을 전화·이메일로 넘겨받지 않는다', () => {
  const env = () => ({ DB: d1, ADMIN_KEY: KEY, KAKAO_CLIENT_ID: 'cid', KAKAO_CLIENT_SECRET: 'sec' });
  async function login(kakao: { id: number; email?: string; phone?: string; nickname?: string }) {
    const e = env();
    const state = await createState(e);
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (String(u).includes('oauth/token')) return new Response(JSON.stringify({ access_token: 'at' }), { headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ id: kakao.id, kakao_account: { email: kakao.email || '', phone_number: kakao.phone || '', profile: { nickname: kakao.nickname || 'nick' } } }), { headers: { 'content-type': 'application/json' } });
    }));
    const req = new Request('https://sewmu-chatbot.pages.dev/api/auth/kakao?code=c&state=' + encodeURIComponent(state));
    const fake = { url: req.url, method: 'GET', headers: { get: (k: string) => (k.toLowerCase() === 'cookie' ? 'oauth_state=' + encodeURIComponent(state) : null) } };
    return kakaoGet({ env: e, request: fake });
  }
  afterEach(() => { vi.unstubAllGlobals(); });

  it('위하고 거래처(manual)와 전화가 같아도 새 pending 계정으로 들어오고 위하고 계정은 그대로', async () => {
    await login({ id: 777, phone: '+82 10-1111-2222' });
    const wehago: any = await d1.prepare(`SELECT provider, provider_id, approval_status FROM users WHERE id = 100`).first();
    expect(wehago).toMatchObject({ provider: 'manual', approval_status: 'approved_client' });
    expect(wehago.provider_id).not.toBe('777');
    const neu: any = await d1.prepare(`SELECT id, approval_status FROM users WHERE provider = 'kakao' AND provider_id = '777'`).first();
    expect(neu).toBeTruthy();
    expect(neu.id).not.toBe(100);
    expect(neu.approval_status).toBe('pending');
  });

  it('직원(👑 관리자)은 예전처럼 이메일로 자기 계정에 붙는다', async () => {
    await user(50, { real_name: '직원', name: '직원', provider: 'manual', email: 'staff@x.kr', is_admin: 1, approval_status: 'approved_client' });
    await login({ id: 888, email: 'staff@x.kr' });
    const s: any = await d1.prepare(`SELECT provider, provider_id FROM users WHERE id = 50`).first();
    expect(s).toMatchObject({ provider: 'kakao', provider_id: '888' });
  });
});

describe('위하고 가져오기 — 법인 대표 생년월일', () => {
  const src = readFileSync(join(__dirname, '../../admin.js'), 'utf8');
  const s = src.indexOf('function _wiBirthFromRrn');
  const e = src.indexOf('async function _wiParseFile');
  const birthFromRrn = new Function(src.slice(s, e) + '\n; return _wiBirthFromRrn;')() as (r: unknown) => string | null;

  it('브라우저 헬퍼: 앞 6자리 + 세기 숫자로 생년월일만', () => {
    expect(birthFromRrn('720420-1234567')).toBe('1972-04-20');
    expect(birthFromRrn('0503153******')).toBe('2005-03-15');
    expect(birthFromRrn('720230-1')).toBeNull();
    expect(birthFromRrn('')).toBeNull();
    expect(birthFromRrn('110111-0000001'.replace('0000001', 'x'))).toBeNull();
  });

  async function preview(rows: unknown[]) {
    const req = { url: 'https://sewmu-chatbot.pages.dev/api/admin-bulk-import-clients?action=preview&key=' + KEY, method: 'POST',
      headers: { get: (k: string) => (k.toLowerCase() === 'origin' ? 'https://sewmu-chatbot.pages.dev' : null) }, json: async () => ({ rows, source_file: 't.xlsx' }) };
    const r = await importPost({ env: { DB: d1, ADMIN_KEY: KEY }, request: req });
    const j = await r.json() as any;
    return { ok: j.ok, ...(j.preview || {}) };
  }
  it('법인 대표 생년월일이 같으면 같은 사람, 다르면 동명이인으로 새 사람', async () => {
    const same = await preview([{ no: 2, company: '새법인', biz_no: '1018199999', corp_or_indiv: '법인', resident_or_corp_no: '110111-1234567', rep_birth: '1972-04-20', ceo: '홍길동', phone: '' }]);
    expect(same.ok).not.toBe(false);
    expect(same.details[0].user).toMatchObject({ action: 'matched', existing_id: 100 });
    const diff = await preview([{ no: 2, company: '새법인', biz_no: '1018199999', corp_or_indiv: '법인', resident_or_corp_no: '110111-1234567', rep_birth: '1990-09-09', ceo: '홍길동', phone: '' }]);
    expect(diff.details[0].user).toMatchObject({ action: 'new', birth_date: '1990-09-09' });
  });
  it('승인 전 카톡 가입자(홍길동, 생년월일 없음)에게는 이름만으로 붙이지 않는다', async () => {
    await d1.prepare(`UPDATE users SET deleted_at = datetime('now') WHERE id IN (100, 200)`).run();
    const r = await preview([{ no: 2, company: '새법인', biz_no: '1018199999', corp_or_indiv: '법인', resident_or_corp_no: '110111-1234567', rep_birth: '1972-04-20', ceo: '홍길동', phone: '' }]);
    expect(r.details[0].user.action).toBe('new');
    await d1.prepare(`UPDATE users SET deleted_at = NULL WHERE id IN (100, 200)`).run();
  });
  it('형식이 이상한 rep_birth 는 무시 (예전처럼 이름으로만)', async () => {
    const r = await preview([{ no: 2, company: '새법인', biz_no: '1018199999', corp_or_indiv: '법인', resident_or_corp_no: '110111-1234567', rep_birth: '720420-1234567', ceo: '김경리', phone: '' }]);
    expect(r.details[0].user.birth_date ?? null).toBeNull();
  });
});
