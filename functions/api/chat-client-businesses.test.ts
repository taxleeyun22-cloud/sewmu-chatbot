/**
 * chat.js getClientBusinesses / buildClientContext — 챗봇이 "이 사람의 사업장" 으로 아는 목록.
 *
 * 2026-10-20 사장님: "A 가 갑을병정 4개 사업체 (갑을 법인, 병정 개인) … 챗봇에 '내 무슨 업체 뭐가 얼마지?' 하면 답하게.
 * 그런 매칭이 확실하게 돼야."
 *
 * 여기서 지키는 것:
 *  1. 목록의 기준은 business_members (사장님이 확정한 연결) — 법인 검토표 숫자와 같은 출처
 *  2. 법인/개인 구분, 폐업·지점·담당자 표시
 *  3. 끊긴 연결(removed_at)·지운 사업장·남의 사업장은 절대 안 나온다
 *  4. 옛 client_businesses 는 뒤에 붙이되 같은 사업자번호는 한 번만, 주 사업장은 하나만
 *  5. 프롬프트에 "목록에 없는 상호는 숫자 지어내지 말 것" 가드
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb } from '../../packages/db/src/test-db';

type Biz = Record<string, any>;
const src = readFileSync(join(__dirname, 'chat.js'), 'utf8');
const start = src.indexOf('const _BIZ_FORM');
const end = src.indexOf('async function getClientFilings');
const M = new Function(src.slice(start, end) + '\n; return { getClientBusinesses, buildClientContext };')() as {
  getClientBusinesses: (db: unknown, userId: number) => Promise<Biz[]>;
  buildClientContext: (b: Biz[], name: string | null) => string;
};

let d1: ReturnType<typeof createTestDb>['d1'];
const A = 10, B = 20;
async function biz(id: number, name: string, no: string, form: string, extra: Record<string, unknown> = {}) {
  const cols = ['id', 'company_name', 'business_number', 'company_form', ...Object.keys(extra)];
  const vals = [id, name, no, form, ...Object.values(extra)];
  await d1.prepare(`INSERT INTO businesses (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...vals).run();
}
async function link(bizId: number, userId: number, extra: Record<string, unknown> = {}) {
  const cols = ['business_id', 'user_id', ...Object.keys(extra)];
  const vals = [bizId, userId, ...Object.values(extra)];
  await d1.prepare(`INSERT INTO business_members (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...vals).run();
}

beforeEach(async () => {
  d1 = createTestDb().d1;
  /* A: 갑·을 법인, 병·정 개인. B: 무관한 다른 거래처 */
  await biz(1, '(주)갑', '1018100001', '0.법인사업자', { tax_type: '일반', business_category: '도소매', industry: '전자상거래' });
  await biz(2, '을주식회사', '1018100002', '0.법인사업자');
  await biz(3, '병식당', '2010000003', '1.개인사업자', { tax_type: '일반', industry: '한식' });
  await biz(4, '정카페', '2010000004', '2.간이사업자', { status: 'closed', closed_date: '2026-03-31' });
  await biz(5, '무관상사', '3010000005', '1.개인사업자');
  await biz(6, '갑 지점', '1018100006', '0.법인사업자', { parent_business_id: 1 });
  await biz(7, '지운회사', '1018100007', '0.법인사업자', { deleted_at: '2026-09-01 00:00:00' });
  await biz(8, '끊긴회사', '1018100008', '0.법인사업자');
  await link(1, A, { role: '대표자', is_primary: 1 });
  await link(2, A, { role: '대표자' });
  await link(3, A, { role: '대표자' });
  await link(4, A, { role: '대표자' });
  await link(6, A, { role: '담당자' });
  await link(7, A, { role: '대표자' });
  await link(8, A, { role: '대표자', removed_at: '2026-10-01 00:00:00' });
  await link(5, B, { role: '대표자', is_primary: 1 });
});

describe('챗봇 사업장 목록 — 연결표 기준', () => {
  it('A 는 갑·을·병·정 + 갑 지점만, 주 사업장이 맨 앞. 지운·끊긴·남의 사업장은 없다', async () => {
    const list = await M.getClientBusinesses(d1, A);
    expect(list.map((b) => b.company_name)).toEqual(['(주)갑', '을주식회사', '병식당', '정카페', '갑 지점']);
    expect(list.map((b) => b.company_name)).not.toContain('무관상사');
    expect(list.map((b) => b.company_name)).not.toContain('지운회사');
    expect(list.map((b) => b.company_name)).not.toContain('끊긴회사');
    expect(list[0]).toMatchObject({ is_primary: 1, business_type: '법인사업자', industry: '도소매 / 전자상거래' });
    expect(list[2]).toMatchObject({ business_type: '개인사업자', closed: false });
    expect(list[3]).toMatchObject({ business_type: '간이과세 개인사업자', closed: true, closed_date: '2026-03-31' });
    expect(list[4]).toMatchObject({ branch: 1, role: '담당자' });
  });

  it('B 는 자기 사업장 하나만', async () => {
    const list = await M.getClientBusinesses(d1, B);
    expect(list.map((b) => b.company_name)).toEqual(['무관상사']);
  });

  it('옛 client_businesses 는 뒤에 붙이되 같은 사업자번호는 한 번만, 주 사업장은 연결표 것 하나만', async () => {
    await d1.prepare(`CREATE TABLE client_businesses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, company_name TEXT, business_number TEXT,
      ceo_name TEXT, industry TEXT, business_type TEXT, tax_type TEXT, establishment_date TEXT, phone TEXT, employee_count INTEGER,
      last_revenue INTEGER, vat_period TEXT, notes TEXT, is_primary INTEGER)`).run();
    await d1.prepare(`INSERT INTO client_businesses (user_id, company_name, business_number, is_primary) VALUES (?, '병식당(옛)', '201-00-00003', 1), (?, '옛날상회', '9990000001', 1)`).bind(A, A).run();
    const list = await M.getClientBusinesses(d1, A);
    expect(list.filter((b) => String(b.business_number || '').replace(/\D/g, '') === '2010000003')).toHaveLength(1);
    expect(list.map((b) => b.company_name)).toContain('옛날상회');
    expect(list.filter((b) => b.is_primary)).toHaveLength(1);
    expect(list.find((b) => b.is_primary)!.company_name).toBe('(주)갑');
  });

  it('연결표가 비어 있으면 옛 표만으로도 동작 (연결 전 거래처)', async () => {
    await d1.prepare(`CREATE TABLE client_businesses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, company_name TEXT, business_number TEXT,
      ceo_name TEXT, industry TEXT, business_type TEXT, tax_type TEXT, establishment_date TEXT, phone TEXT, employee_count INTEGER,
      last_revenue INTEGER, vat_period TEXT, notes TEXT, is_primary INTEGER)`).run();
    await d1.prepare(`INSERT INTO client_businesses (user_id, company_name, business_number, is_primary) VALUES (99, '옛날상회', '9990000001', 1)`).run();
    expect((await M.getClientBusinesses(d1, 99)).map((b) => b.company_name)).toEqual(['옛날상회']);
  });
});

describe('챗봇 프롬프트', () => {
  it('복수 사업장: 법인/개인·폐업·지점·담당자 표시 + 목록 밖 상호는 숫자 지어내지 말라는 가드', async () => {
    const ctx = M.buildClientContext(await M.getClientBusinesses(d1, A), '홍길동');
    expect(ctx).toContain('5개 사업장');
    expect(ctx).toContain('[사업장 1 · 주 사업장]');
    expect(ctx).toContain('- 사업 형태: 법인사업자');
    expect(ctx).toContain('[사업장 4 · 폐업]');
    expect(ctx).toContain('- 상태: 폐업 (2026-03-31)');
    expect(ctx).toContain('[사업장 5 · 지점 · 담당자로 연결]');
    expect(ctx).toContain('연결된 사업장은 위 목록((주)갑, 을주식회사, 병식당, 정카페, 갑 지점)뿐');
    expect(ctx).toContain('숫자를 지어내지 말고');
    /* 사업자번호는 프롬프트에 안 나간다 (기존 규칙) */
    expect(ctx).not.toContain('1018100001');
  });

  it('단일 사업장도 같은 가드', async () => {
    const ctx = M.buildClientContext(await M.getClientBusinesses(d1, B), null);
    expect(ctx).toContain('위 1곳(무관상사)뿐');
    expect(ctx).toContain('숫자를 지어내지 말고');
  });
});
