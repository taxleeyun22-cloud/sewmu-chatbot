/**
 * 검토표 모아보기 목록 (/api/admin-filings?all=1) — 세액공제·감면 필터용 데이터.
 * 사장님 2026-11-11: "어떤 세액 감면 공제가 적용됐냐 필터링에 고용증대 하면 그거 받은 업체들 다 나오게".
 *
 * 지키는 것: 각 행에 credits [{name, amount}] + deduction_total 이 붙고, auto_fields 원문은 안 나간다.
 *            옛 키(deductions)·깨진 JSON·빈 값도 죽지 않는다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module
import { onRequestGet, filingCredits } from './admin-filings.js';

const KEY = 'test-admin-key';
let d1: ReturnType<typeof createTestDb>['d1'];

async function filing(id: number, type: string, ownerId: number, af: unknown, extra: Record<string, unknown> = {}) {
  const f: Record<string, unknown> = { id, type, fiscal_year: 2025, owner_type: 'Business', owner_id: ownerId, auto_fields: typeof af === 'string' ? af : JSON.stringify(af), ...extra };
  const cols = Object.keys(f);
  await d1.prepare(`INSERT INTO filings (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...Object.values(f)).run();
}
async function list() {
  const req = { url: 'https://sewmu-chatbot.pages.dev/api/admin-filings?all=1&key=' + KEY, method: 'GET', headers: { get: () => null } };
  const r = await onRequestGet({ env: { DB: d1, ADMIN_KEY: KEY }, request: req });
  return { status: r.status, body: await r.json() as any };
}

beforeEach(async () => {
  d1 = createTestDb().d1;
  await d1.prepare(`INSERT INTO businesses (id, company_name) VALUES (1, '갑식당'), (2, '을상사'), (3, '병카페')`).run();
  await filing(10, '종소세', 1, { 공제감면: [{ code: '14Q', name: '고용을증대시킨기업에대한세액공제', amount: 7_700_000 }, { code: '244', name: '전자신고세액공제', amount: 20_000 }], deduction_total: 7_720_000 });
  await filing(11, '종소세', 2, { deductions: [{ 종류: '통합고용세액공제', 금액: '13251652' }] });
  await filing(12, '종소세', 3, '{깨진 json');
});

describe('GET /api/admin-filings?all=1 — 공제·감면', () => {
  it('행마다 credits·deduction_total 이 붙고 auto_fields 원문은 안 나간다', async () => {
    const r = await list();
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.body.filings.map((f: any) => [f.id, f]));
    expect(by[10].credits).toEqual([
      { name: '고용을증대시킨기업에대한세액공제', amount: 7_700_000 },
      { name: '전자신고세액공제', amount: 20_000 },
    ]);
    expect(by[10].deduction_total).toBe(7_720_000);
    expect(by[10].business_name).toBe('갑식당');
    expect('auto_fields' in by[10]).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain('14Q');
  });
  it('옛 키(deductions/종류/금액)도 읽고, 깨진 JSON 은 빈 목록', async () => {
    const r = await list();
    const by = Object.fromEntries(r.body.filings.map((f: any) => [f.id, f]));
    expect(by[11].credits).toEqual([{ name: '통합고용세액공제', amount: 13_251_652 }]);
    expect(by[11].deduction_total).toBeNull();
    expect(by[12].credits).toEqual([]);
  });
  it('키 없으면 401', async () => {
    const req = { url: 'https://sewmu-chatbot.pages.dev/api/admin-filings?all=1', method: 'GET', headers: { get: () => null } };
    expect((await onRequestGet({ env: { DB: d1, ADMIN_KEY: KEY }, request: req })).status).toBe(401);
  });
});

describe('filingCredits', () => {
  it('이름 없는 항목·금액 빈칸·30개 초과 처리', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: '공제' + i, amount: i }));
    expect(filingCredits(JSON.stringify({ 공제감면: many })).credits).toHaveLength(30);
    expect(filingCredits(JSON.stringify({ 공제감면: [{ name: '' }, { name: '중소기업특별세액감면', amount: '' }, null] })).credits)
      .toEqual([{ name: '중소기업특별세액감면', amount: null }]);
    expect(filingCredits(null)).toEqual({ credits: [], deduction_total: null });
    /* 새 키가 빈 배열이면 옛 키를 본다 */
    expect(filingCredits(JSON.stringify({ 공제감면: [], deductions: [{ name: '창업중소기업세액감면', amount: 5 }] })).credits)
      .toEqual([{ name: '창업중소기업세액감면', amount: 5 }]);
  });
});
