/**
 * 💰 기장료 수납 (bk-fees.html) — 화면 계약. 실제 배포 파일을 띄우고 fetch 만 가짜로 바꾼다.
 * 지키는 것: 격자 기호(○·✕·⋯·–), "미납 있는 곳만", ✕ 누르면 입금일 묻고 client_id 로 POST, 수기 ○ 만 해제 가능,
 *           파일 4종 자동 인식(2026-11-13 사장님 "이 4개로 다 할 수 있게"), 위하고 주민번호 뒷자리 안 보냄, 이름 escape.
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
  api = new Function('fetch', 'prompt', 'confirm', 'alert', script + '\nreturn {render, mark, unmark, setGrid: function(g){ GRID=g; }, rowsFromMatrix, toBank, toCms, toMaster, detect, toWehago, toCmsMembers, headerRow, openNew, pickNew, saveNew, toggleHelp};')(
    fetchStub, () => promptVal, () => true, vi.fn());
  /* 실제 페이지에서는 classic script 의 전역 함수 — 인라인 onclick 이 찾을 수 있게 */
  Object.assign(window as any, { mark: api.mark, unmark: api.unmark });
  (window as any)._newHits = [];
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
    expect(JSON.parse(p.init.body)).toEqual({ client_id: 1, period: '2026-03', amount: 110000, paid_at: '2026-03-31' });
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

describe('2차 — 파일 종류 자동 인식 · 위하고 · 신규 수임', () => {
  it('제목 줄로 가린다 — 사장님이 올리는 4종 (CMS 회원목록·결제조회·카드 승인조회·위하고) + 세무포털 5번째 줄 헤더', () => {
    expect(api.detect(['순번', '회원번호', '회원명', '약정일', '기본금액'])).toBe('cms_members');
    expect(api.detect(['회원번호', '회원명', '결제일', '결제금액', '결제상태'])).toBe('cms_bank');
    expect(api.detect(['승인일', '회원번호', '회원명', '승인상태', '신청금액', '승인금액'])).toBe('cms_card');
    expect(api.detect(['코드', '상호', '대표자', '사업자등록번호', '세무대리담당자'])).toBe('wehago');
    expect(api.detect(['아무거나'])).toBeNull();
    const m = [['세무사CMS'], [''], ['회원조회'], ['총 2건'],
      ['회원번호', '회원명', '약정일', '기본금액', '회원상태', '결제구분', '생년월일/사업자번호', '결제자명', '결제신청가능', '결제시작일', '결제종료일', '가입일'],
      ['M001', '갑', '25', '110,000', '신청완료', '계좌', '850101', '홍길동', '출금가능', '2025-03-10', '9999-12-31', '2025-03-01'],
      ['M002', '을', '25', '220,000', '신청불능', '카드', '1018100001', '', '출금불가', '', '2026-08-31', '2024-02-01']];
    expect(api.headerRow(m)).toBe(4);
    expect(api.toCmsMembers(api.rowsFromMatrix(m))).toEqual([
      { member_no: 'M001', member_name: '갑', pay_day: 25, amount: 110000, member_status: '신청완료', payer: '홍길동', can_withdraw: '출금가능',
        pay_type: '계좌', start_date: '2025-03-10', end_date: '9999-12-31', key: '850101' },
      { member_no: 'M002', member_name: '을', pay_day: 25, amount: 220000, member_status: '신청불능', payer: '', can_withdraw: '출금불가',
        pay_type: '카드', start_date: '2024-02-01', end_date: '2026-08-31', key: '1018100001' },
    ]);
  });
  it('위하고 명부 두 줄 형식 — 상호·사업자번호·담당 + 대표자, 주민번호는 앞 6자리만 (뒷자리는 절대 안 보냄)', () => {
    const m = [
      ['구분', '코드', '상호', '', '', '사업자등록번호', '주민등록번호', '', '', '', '세무대리담당자'],
      ['1', '0001', '(주)갑', '', '', '101-81-00001', '', '', '', '', '이직원'],
      ['', '', '홍길동', '', '', '', '', '', '', '', ''],
      ['2', '0002', '을식당', '', '', '201-00-00002', '850101-1234567', '', '', '', '김직원'],
      ['3', '0003', '사업자번호없음', '', '', '', '', '', '', '', ''],
    ];
    const rows = api.toWehago(m, 0);
    expect(rows).toEqual([
      { company_name: '(주)갑', business_number: '101-81-00001', staff_name: '이직원', ceo_name: '홍길동', birth6: '' },
      { company_name: '을식당', business_number: '201-00-00002', staff_name: '김직원', ceo_name: '', birth6: '850101' },
    ]);
    expect(JSON.stringify(rows)).not.toContain('1234567');
  });
  it('신규 수임 (이체): 이름·기장료로 save_client POST, admin 업체 고르면 business_id 같이', async () => {
    api.openNew();
    (window as any)._newHits = [{ id: 7, company_name: '정공업', ceo_name: '정사장', business_number: '3010000003' }];
    api.pickNew(0);
    (document.getElementById('nFee') as HTMLInputElement).value = '165,000';
    (document.getElementById('nStart') as HTMLInputElement).value = '2026-09';
    await api.saveNew();
    const p = calls.find((c) => c.url.includes('action=save_client'))!;
    expect(JSON.parse(p.init.body)).toMatchObject({ name: '정공업', business_id: 7, bill: '165000', bk_start: '2026-09', pay_method: '직접이체', business_number: '3010000003' });
  });
  it('⋯ 출금 중 · 자료 없는 달 – 에 이유 표시, CMS 자료 범위는 계좌·카드 따로', () => {
    const g = JSON.parse(JSON.stringify(GRID));
    g.coverage_by = { 'CMS계좌': { from: '2026-05', to: '2026-10' }, 'CMS카드': { from: '2026-06', to: '2026-10' } };
    g.rows[0].cells[9] = { s: 'p', a: 110000, why: '출금중' };
    g.rows[0].cells[3] = { s: '-', nodata: true };
    g.rows[0].cells[2] = { s: 'x', a: 110000, why: '재출금실패 · 잔액부족' };
    api.setGrid(g); api.render();
    const tr = trs()[0];
    expect(tr.querySelector('.c.p')!.getAttribute('title')).toContain('출금중');
    expect(tr.querySelectorAll('.c.n')[0].getAttribute('title')).toContain('자료가 없는');
    expect(tr.querySelector('.c.x')!.getAttribute('title')).toContain('잔액부족');
    expect(document.getElementById('kpi')!.textContent).toContain('계좌 26.05~10 · 카드 26.06~10');
  });
  it('거래처별 안 들어온 돈 칸 + 도움말에 캡처 이미지 없음', () => {
    expect(trs()[0].lastElementChild!.textContent).toBe('110,000원');
    api.toggleHelp();
    const h = document.getElementById('help')!;
    expect(h.textContent).toContain('CMS 회원목록');
    expect(h.querySelector('img')).toBeNull();
  });
});

