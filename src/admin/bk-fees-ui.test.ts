/**
 * 💰 기장료 수납 (bk-fees.html) — 화면 계약. 실제 배포 파일을 띄우고 fetch 만 가짜로 바꾼다.
 * 지키는 것: 격자 기호(○·✕·–), "미납 있는 곳만", ✕ 누르면 입금일 묻고 POST, 수기 ○ 만 해제 가능,
 *           엑셀 헤더 줄 자동 탐지(은행 파일 3번째 줄), 통장 집금 행 제외, 이름 escape.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('bk-fees.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script>'));
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

const cells = (s: string, src = 'CMS') => s.split('').map((c) => c === 'o' ? { s: 'o', d: '2026-03-25', a: 110000, src } : c === 'x' ? { s: 'x', a: 110000 } : { s: '-' });
const GRID = {
  ok: true, year: 2026, lastClosed: 10,
  total: { biz: 3, openAmt: 330000, openBiz: 2 },
  rows: [
    { id: 1, name: '(주)갑', ceo: '홍길동', staff: '담당A', fee: 110000, cms: 'M001', pay: 'CMS계좌', start: '2025-01', end: '', end_reason: '', nts: '', events: [], cells: cells('ooxooooooo--') },
    { id: 2, name: '<b>을</b>식당', ceo: '김을순', staff: '담당B', fee: 110000, cms: '', pay: '', start: '', end: '2026-07', end_reason: '폐업', nts: '폐업자', events: [], cells: cells('oooxooo-----', '수기') },
    { id: 3, name: '병카페', ceo: '박병철', staff: '담당A', fee: 110000, cms: '', pay: '', start: '', end: '', end_reason: '', nts: '', events: [], cells: cells('oooooooooo--') },
  ],
};
let calls: { url: string; init?: any }[];
let api: any;
let promptVal: string | null;

beforeEach(async () => {
  document.body.innerHTML = body;
  calls = [];
  promptVal = '2026-03-31';
  const fetchStub = async (url: string, init?: any) => {
    calls.push({ url, init });
    return { status: 200, ok: true, json: async () => (url.includes('action=grid') ? JSON.parse(JSON.stringify(GRID)) : { ok: true }) };
  };
  api = new Function('fetch', 'prompt', 'confirm', 'alert', script + '\nreturn {render, mark, unmark, rowsFromMatrix, toBank, toCms, toMaster};')(
    fetchStub, () => promptVal, () => true, vi.fn());
  /* 실제 페이지에서는 classic script 의 전역 함수 — 인라인 onclick 이 찾을 수 있게 */
  Object.assign(window as any, { mark: api.mark, unmark: api.unmark });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
});

const trs = () => [...document.querySelectorAll('#list tr')] as HTMLTableRowElement[];

describe('기장료 수납 화면', () => {
  it('기본 "미납 있는 곳만" — 다 낸 병카페는 숨김, 미수 합계', () => {
    expect(trs().map((t) => t.querySelector('.nm')!.textContent)).toEqual(['(주)갑', '<b>을</b>식당']);
    expect(document.getElementById('kpi')!.textContent).toContain('220,000원');
    (document.getElementById('onlyOpen') as HTMLInputElement).checked = false;
    api.render();
    expect(trs()).toHaveLength(3);
  });
  it('격자 기호와 폐업·국세청 표시, 이름 escape', () => {
    const first = trs()[0];
    expect([...first.querySelectorAll('.c')].map((b) => b.textContent).join('')).toBe('○○✕○○○○○○○––');
    const list = document.getElementById('list')!.innerHTML;
    expect(list).toContain('폐업 2026-07');
    expect(list).toContain('국세청 폐업자');
    expect(list).not.toContain('<b>을</b>');
  });
  it('✕ 누르면 입금일 묻고 mark_paid POST, 취소하면 안 보냄', async () => {
    (trs()[0].querySelector('.c.x') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const p = calls.find((c) => c.url.includes('action=mark_paid'))!;
    expect(JSON.parse(p.init.body)).toEqual({ business_id: 1, period: '2026-03', amount: 110000, paid_at: '2026-03-31' });
    calls = []; promptVal = null;
    await api.mark(1, '2026-03', 110000);
    expect(calls.some((c) => c.url.includes('mark_paid'))).toBe(false);
  });
  it('CMS ○ 는 눌러도 아무 일 없고, 수기 ○ 만 해제 버튼', () => {
    expect(trs()[0].querySelector('.c.o.man')).toBeNull();
    expect(trs()[1].querySelectorAll('.c.o.man').length).toBe(6);
  });
});

describe('엑셀 행 변환', () => {
  it('헤더가 3번째 줄인 은행 파일도 읽고, 집금·출금은 뺀다', () => {
    const m = [['거래내역조회'], ['계좌 123-45'], ['거래일시', '적요', '출금액', '입금액', '비고'],
      ['2026.05.10 14:00', '김을순', '', '165,000', ''], ['2026.05.25 09:00', 'CMS집금', '', '3,000,000', ''], ['2026.05.26', '카드대금', '50,000', '', '']];
    const rows = api.toBank(api.rowsFromMatrix(m));
    expect(rows).toEqual([{ tx_date: '2026.05.10 14:00', amount: 165000, payer: '김을순', memo: '' }]);
  });
  it('CMS·마스터 컬럼 이름', () => {
    const cms = api.toCms(api.rowsFromMatrix([['회원번호', '회원명', '결제일', '결제금액', '결제상태'], ['M001', '갑', '2026-03-25', '110,000', '출금성공']]));
    expect(cms[0]).toMatchObject({ member_no: 'M001', amount: 110000, status: '출금성공', method: 'CMS계좌' });
    const ms = api.toMaster(api.rowsFromMatrix([['상호', '대표자', '기장료', '담당', '기장시작'], ['을식당', '김을순', '150,000', '담당B', '2026-04'], ['빈곳', '', '', '', '']]));
    expect(ms).toEqual([{ company_name: '을식당', ceo_name: '김을순', business_number: '', monthly_fee: 150000, cms_member_no: '', pay_method: '', staff_name: '담당B', bk_start: '2026-04' }]);
  });
});
