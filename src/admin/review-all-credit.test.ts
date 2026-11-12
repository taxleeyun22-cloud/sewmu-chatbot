/**
 * 검토표 모아보기 (review-all.html) — 세액공제·감면 필터.
 * 사장님 2026-11-11: "어떤 세액 감면 공제가 적용됐냐, 필터링에 고용증대 하면 그거 받은 업체들 다 나오게".
 *
 * 실제 배포 파일의 화면·스크립트를 그대로 띄우고 fetch 만 가짜로 바꾼다.
 * 지키는 것:
 *  1. 고용증대 = 정식명("고용을 증대시킨 기업에 대한 세액공제")·약칭·청년고용증대 / 통합고용과는 따로
 *  2. "고용 관련 전체" = 고용증대 + 통합고용 (+ 정규직전환 등)
 *  3. 감면(중소기업특별·창업) · 공제명 직접 검색 · "있는 것만"
 *  4. 탭 숫자도 필터 기준, 맞은 항목은 목록 칸에, CSV 에 공제·감면 내역 칸
 *  5. 상태 선택지가 서버 값(보관완료)과 같다
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('review-all.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script>'));
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

const F = (id: number, name: string, type: string, credits: { name: string; amount: number | null }[], extra: Record<string, unknown> = {}) =>
  ({ id, type, fiscal_year: 2025, owner_type: 'Business', owner_id: id, business_name: name, review_status: '작성중', credits, deduction_total: null, ...extra });
const DATA = [
  F(1, '고용증대정식', '종소세', [{ name: '고용을증대시킨기업에대한세액공제', amount: 7_700_000 }, { name: '전자신고세액공제', amount: 20_000 }]),
  F(2, '고용증대약칭', '종소세', [{ name: '고용증대 세액공제', amount: 1_000_000 }]),
  F(3, '청년고용', '종소세', [{ name: '청년고용증대 세액공제', amount: 500_000 }]),
  F(4, '통합고용', '종소세', [{ name: '통합고용세액공제', amount: 13_251_652 }]),
  F(5, '중특', '종소세', [{ name: '중소기업에대한특별세액감면', amount: 3_000_000 }]),
  F(6, '창업', '종소세', [{ name: '창업중소기업 세액감면', amount: 2_000_000 }]),
  F(7, '공제없음', '종소세', []),
  F(8, '합계만', '종소세', [], { deduction_total: 900_000 }),
  F(9, '법인고용', '법인세', [{ name: '고용증대세액공제', amount: 4_000_000 }]),
];

type Api = { getFiltered: (t?: string) => any[]; render: () => void; exportCsv: () => void };
let api: Api;
let csv = '';

beforeEach(async () => {
  document.body.innerHTML = body;
  const fetchStub = async () => ({ status: 200, json: async () => ({ ok: true, filings: JSON.parse(JSON.stringify(DATA)) }) });
  /* CSV 는 Blob 을 가로채서 확인 */
  const BlobStub = function (this: any, parts: string[]) { csv = parts.join(''); } as any;
  const URLStub = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  api = new Function('fetch', 'Blob', 'URL', 'setTimeout', script + '\nreturn {getFiltered, render, exportCsv};')(
    fetchStub, BlobStub, URLStub, (f: () => void) => f()) as Api;
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
});

const pick = (v: string) => { (document.getElementById('cr') as HTMLSelectElement).value = v; api.render(); };
const names = () => api.getFiltered().map((f) => f.business_name);

describe('세액공제·감면 필터', () => {
  it('고용증대 — 정식명·약칭·청년고용증대, 통합고용은 빠진다', () => {
    pick('emp_inc');
    expect(names()).toEqual(['고용증대정식', '고용증대약칭', '청년고용']);
  });
  it('통합고용만 / 고용 관련 전체', () => {
    pick('emp_int');
    expect(names()).toEqual(['통합고용']);
    pick('emp_all');
    expect(names()).toEqual(['고용증대정식', '고용증대약칭', '청년고용', '통합고용']);
  });
  it('감면 — 중소기업특별·창업', () => {
    pick('sme'); expect(names()).toEqual(['중특']);
    pick('startup'); expect(names()).toEqual(['창업']);
  });
  it('있는 것만 — 항목 없이 합계만 있는 검토표도 포함, 하나도 없으면 제외', () => {
    pick('any');
    expect(names()).not.toContain('공제없음');
    expect(names()).toContain('합계만');
  });
  it('공제명 직접 검색 (띄어쓰기 무시) + 그룹과 같이 쓰면 둘 다 맞아야', () => {
    (document.getElementById('crq') as HTMLInputElement).value = '전자 신고';
    pick('');
    expect(names()).toEqual(['고용증대정식']);
    pick('emp_int');
    expect(names()).toEqual([]);
  });
  it('탭 숫자도 필터 기준 — 법인세 탭의 고용증대도 센다', () => {
    pick('emp_inc');
    expect(document.getElementById('c-종소세')!.textContent).toBe('3');
    expect(document.getElementById('c-법인세')!.textContent).toBe('1');
  });
  it('목록 칸에 맞은 항목과 금액, 이름은 escape', () => {
    pick('emp_int');
    const list = document.getElementById('list')!.innerHTML;
    expect(list).toContain('<b>통합고용세액공제</b>');
    expect(list).toContain('13,251,652원');
  });
  it('CSV 에 공제·감면 내역 칸', () => {
    pick('emp_inc');
    api.exportCsv();
    expect(csv).toContain('"공제·감면 내역"');
    expect(csv).toContain('"고용을증대시킨기업에대한세액공제 7,700,000원; 전자신고세액공제 20,000원"');
  });
  it('상태 선택지가 서버 값과 같다 (보관완료)', () => {
    const opts = [...document.querySelectorAll('#st option')].map((o) => (o as HTMLOptionElement).value);
    expect(opts).toEqual(['', '작성중', '결재대기', '보관완료']);
  });
});
