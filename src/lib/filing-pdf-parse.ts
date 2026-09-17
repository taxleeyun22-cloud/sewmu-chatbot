/**
 * 종합소득세 신고서(별지 제40호서식) 텍스트 → 검토표 필드 파서.
 *
 * 사장님 명령 (2026-09-15): "바로 pdf를 어드민에 올리는거??"
 * → 신고서 PDF 를 admin 에 올리면 브라우저에서 pdf.js 로 텍스트를 뽑고,
 *   이 파서가 검토표 필드로 변환한다. PDF 는 서버로 나가지 않는다.
 *
 * 설계 원칙:
 *  - GPT 안 씀. 서식에 인쇄된 항목번호(19/20/21...)를 앵커로 잡는 규칙 파싱.
 *    → 결과가 항상 같고, 비용 0, 할루시네이션 0.
 *  - 검산을 통과하지 못하면 심지 않는다. 틀린 세금 숫자가 조용히 들어가는 것이
 *    제일 위험하다. checks 에 실패가 하나라도 있으면 호출부가 제외한다.
 *  - 주민등록번호는 앞 6자리(생년월일)만 쓰고 뒤 7자리는 읽지도 반환하지도 않는다.
 *    (admin-bulk-import-clients.js 와 동일한 원칙)
 */

export interface DeductionItem {
  code?: string;
  name: string;
  amount: number;
}

export interface ParsedFilingFields {
  revenue?: number;
  total_income?: number;
  income_deduction?: number;
  tax_base?: number;
  calculated_tax?: number;
  deduction_total?: number;
  penalty_total?: number;
  decisive_tax?: number;
  prepaid_tax?: number;
  payable_tax?: number;
  farmland_tax?: number;
  공제감면?: DeductionItem[];
}

export interface ParsedFilingOwner {
  /** 신고서 ① 성명 */
  name?: string;
  /** 주민등록번호 앞 6자리 → YYYY-MM-DD. 뒤 7자리는 읽지 않는다. */
  birth_date?: string;
  /** 사업소득명세서 ⑤ 사업자등록번호 (하이픈 제거). 여러 개면 첫 정상 번호 */
  biz_no?: string;
  /** ④ 상호 */
  company_name?: string;
}

export interface FilingCheck {
  label: string;
  ok: boolean;
  /** 어긋난 금액 (ok=false 일 때만) */
  diff?: number;
}

export interface ParsedFiling {
  type: '종소세';
  fiscal_year?: number;
  owner: ParsedFilingOwner;
  fields: ParsedFilingFields;
  checks: FilingCheck[];
  /** 검산 전부 통과 + 필수 항목 존재 */
  ok: boolean;
  /** ok=false 인 이유 (사람이 읽는 문장) */
  problems: string[];
}

/* ── 유틸 ── */

const toNum = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined) return null;
  const n = Number(String(s).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** 신고서는 "산      출  세   액" 처럼 글자 사이를 늘려 찍는다 — 공백 제거 후 비교 */
const squash = (s: string): string => s.replace(/\s+/g, '');

/**
 * 항목번호로 금액을 찾는다. "<라벨> <항번> <금액>" 형태.
 *
 * ⚠ 라벨로 줄을 특정할 수 없다. 서식이 "종 합 소 득 / 액 금" 처럼 라벨을
 *   두 줄로 쪼개 찍기 때문에, 금액이 있는 줄에는 라벨 조각만 남는다.
 *   → ❹ 세액의 계산 구간으로 범위를 좁힌 뒤 항목번호만으로 찾는다.
 */
function byItemNo(lines: string[], no: number): number | null {
  const re = new RegExp('(?:^|\\s)' + no + '\\s+([\\d,]+)');
  for (const ln of lines) {
    const m = ln.match(re);
    if (m) return toNum(m[1]);
  }
  return null;
}

/** ❹ 세액의 계산 ~ ❼ 사업소득명세서 구간. 못 찾으면 전체를 준다. */
function taxCalcSection(lines: string[], sq: string[]): string[] {
  const start = sq.findIndex((l) => l.includes('세액의계산'));
  if (start < 0) return lines;
  let end = sq.findIndex((l, i) => i > start && l.includes('사업소득명세서'));
  if (end < 0) end = lines.length;
  return lines.slice(start, end);
}

/** 주민번호 앞 6자리 + 7번째 자리(세기) → YYYY-MM-DD. 뒤 7자리 전체는 보관하지 않는다. */
export function rrnToBirthDate(front6: string, centuryDigit: string): string | null {
  if (!/^\d{6}$/.test(front6)) return null;
  const yy = front6.slice(0, 2);
  const mm = front6.slice(2, 4);
  const dd = front6.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  let century: string;
  if (centuryDigit === '1' || centuryDigit === '2') century = '19';
  else if (centuryDigit === '3' || centuryDigit === '4') century = '20';
  else if (centuryDigit === '9' || centuryDigit === '0') century = '18';
  else return null;
  return `${century}${yy}-${mm}-${dd}`;
}

/* ── 본체 ── */

export function parseFilingText(text: string): ParsedFiling {
  const lines = String(text || '').split('\n');
  const sq = lines.map(squash);
  const fields: ParsedFilingFields = {};
  const owner: ParsedFilingOwner = {};
  const problems: string[] = [];

  /* 귀속연도 — "(2025년귀속)" */
  let fiscal_year: number | undefined;
  for (const l of sq) {
    const m = l.match(/\((20\d{2})년귀속\)/);
    if (m) { fiscal_year = Number(m[1]); break; }
  }

  /* ❹ 세액의 계산 — 항목번호 앵커 */
  const put = (k: keyof ParsedFilingFields, v: number | null) => {
    if (v !== null) (fields as Record<string, unknown>)[k] = v;
  };
  const calc = taxCalcSection(lines, sq);
  put('total_income', byItemNo(calc, 19));
  put('income_deduction', byItemNo(calc, 20));
  put('tax_base', byItemNo(calc, 21));
  put('calculated_tax', byItemNo(calc, 23));

  const 감면 = byItemNo(calc, 24) ?? 0;
  const 공제 = byItemNo(calc, 25) ?? 0;
  fields.deduction_total = 감면 + 공제;

  put('decisive_tax', byItemNo(calc, 28));
  fields.penalty_total = byItemNo(calc, 29) ?? 0;
  put('prepaid_tax', byItemNo(calc, 32));
  put('payable_tax', byItemNo(calc, 33) ?? byItemNo(calc, 37));

  /* 농어촌특별세 — 오른쪽 열 항번 53 */
  for (const ln of calc) {
    const m = ln.match(/\s53\s+([\d,]+)/);
    if (m) { put('farmland_tax', toNum(m[1])); break; }
  }

  /* ⑨ 총수입금액 — 사업장이 여러 개면 한 줄에 나란히 찍히므로 전부 합산 */
  for (const ln of lines) {
    if (!squash(ln).includes('총수입금액')) continue;
    const nums = (ln.match(/[\d,]{4,}/g) || []).map(toNum).filter((n): n is number => n !== null);
    if (nums.length) { fields.revenue = nums.reduce((a, b) => a + b, 0); break; }
  }

  /* ⑬ 세액공제명세서 ~ ⑭ 준비금명세서 구간 안에서만 공제 항목을 찾는다.
     문서 전체를 훑으면 손익계산서 항목을 공제로 오인한다 (실측 확인). */
  fields.공제감면 = (() => {
    const start = sq.findIndex((l) => l.includes('세액공제명세서'));
    if (start < 0) return [];
    let end = sq.findIndex((l, i) => i > start && l.includes('준비금명세서'));
    if (end < 0) end = Math.min(lines.length, start + 120);

    const list: DeductionItem[] = [];
    for (const ln of lines.slice(start, end)) {
      /* "<항목명> <코드> <공제대상금액> [(적용률)] <세액공제액>" 또는 "<항목명> <코드> <세액공제액>" */
      let m = ln.match(/^(.+?)\s{2,}(\d{2}[0-9A-Z])\s+([\d,]+)(?:\s*\([^)]*\))?\s+([\d,]+)/);
      let rawName: string, code: string, amount: number | null;
      if (m) { rawName = m[1]; code = m[2]; amount = toNum(m[4]); }
      else {
        m = ln.match(/^(.+?)\s{2,}(\d{2}[0-9A-Z])\s+([\d,]+)\s*$/);
        if (!m) continue;
        rawName = m[1]; code = m[2]; amount = toNum(m[3]);
      }
      const name = squash(rawName).replace(/[^가-힣A-Za-z0-9()·]/g, '');
      if (!name || name.length > 40) continue;
      if (amount === null || amount <= 0) continue;
      if (list.some((d) => d.code === code)) continue;
      list.push({ code, name, amount });
    }
    return list;
  })();

  /* ── 거래처 매칭용 정보 ── */
  for (const ln of lines) {
    const m = ln.match(/①\s*성\s*명\s+(\S+)/) || ln.match(/성\s+명\s{2,}(\S{2,5})\s{2,}②/);
    if (m) { owner.name = m[1].trim(); break; }
  }
  /* 주민번호: 앞 6 + 뒤 첫 자리만 읽고 나머지는 버린다 */
  for (const ln of lines) {
    const m = ln.match(/\b(\d{6})\s*-\s*(\d)\d{6}\b/);
    if (m) { owner.birth_date = rrnToBirthDate(m[1], m[2]) ?? undefined; break; }
  }
  /* ⚠ 반드시 ❼ 사업소득명세서 구간 안에서만 찾는다. 신고서 1면의
     ❸ 세무대리인 칸에 세무사 본인의 사업자등록번호가 먼저 찍혀 있어서,
     문서 순서대로 훑으면 세무대리인 번호를 거래처 번호로 오인한다 (실측 확인).
     한 줄에 사업장이 여러 개 나란히 오므로 줄 안의 모든 번호를 훑는다. */
  const bizSection = (() => {
    const start = sq.findIndex((l) => l.includes('사업소득명세서'));
    if (start < 0) return [];
    let end = sq.findIndex((l, i) => i > start && l.includes('종합소득금액및결손금'));
    if (end < 0) end = Math.min(lines.length, start + 60);
    return lines.slice(start, end);
  })();
  outer: for (const ln of bizSection) {
    for (const m of ln.matchAll(/\b(\d{3})-(\d{2})-(\d{5})\b/g)) {
      const bn = m[1] + m[2] + m[3];
      if (/^0+$/.test(bn)) continue;         /* 000-00-00000 = 사업자등록 없는 인적용역 */
      owner.biz_no = bn;
      break outer;
    }
  }
  for (const ln of bizSection.length ? bizSection : lines) {
    const m = ln.match(/④\s*상\s*호\s+(\S.*?)(?:\s{2,}|\s*$)/);
    if (m) { owner.company_name = m[1].trim(); break; }
  }

  /* ── 검산 ── */
  const checks: FilingCheck[] = [];
  const add = (label: string, a?: number, b?: number) => {
    if (a === undefined || b === undefined) return;   /* 값이 없으면 검산 대상 아님 */
    checks.push({ label, ok: a === b, ...(a === b ? {} : { diff: a - b }) });
  };
  add(
    '과세표준 = 종합소득금액 − 종합소득공제',
    fields.tax_base,
    fields.total_income !== undefined && fields.income_deduction !== undefined
      ? fields.total_income - fields.income_deduction : undefined,
  );
  add(
    '결정세액 = 산출세액 − 공제·감면',
    fields.decisive_tax,
    fields.calculated_tax !== undefined && fields.deduction_total !== undefined
      ? fields.calculated_tax - fields.deduction_total : undefined,
  );
  add(
    '납부할세액 = 결정세액 − 기납부세액',
    fields.payable_tax,
    fields.decisive_tax !== undefined && fields.prepaid_tax !== undefined
      ? fields.decisive_tax - fields.prepaid_tax : undefined,
  );
  if (fields.공제감면 && fields.공제감면.length) {
    add(
      '공제 내역 합 = 공제·감면 합계',
      fields.공제감면.reduce((s, d) => s + d.amount, 0),
      fields.deduction_total,
    );
  }

  /* ── 필수 항목 ── */
  const REQUIRED: Array<[keyof ParsedFilingFields, string]> = [
    ['revenue', '수입금액'],
    ['total_income', '종합소득금액'],
    ['calculated_tax', '산출세액'],
    ['decisive_tax', '결정세액'],
  ];
  for (const [k, label] of REQUIRED) {
    if (fields[k] === undefined) problems.push(`${label}을(를) 못 읽었습니다`);
  }
  if (!fiscal_year) problems.push('귀속연도를 못 읽었습니다');
  if (!owner.name) problems.push('성명을 못 읽었습니다');
  for (const c of checks) {
    if (!c.ok) problems.push(`검산 불일치 — ${c.label} (차이 ${(c.diff ?? 0).toLocaleString('ko-KR')}원)`);
  }
  if (!checks.length) problems.push('검산할 수 있는 항목이 없습니다');

  return {
    type: '종소세',
    fiscal_year,
    owner,
    fields,
    checks,
    ok: problems.length === 0,
    problems,
  };
}

declare global {
  interface Window {
    __parseFilingText?: typeof parseFilingText;
  }
}
if (typeof window !== 'undefined') window.__parseFilingText = parseFilingText;
