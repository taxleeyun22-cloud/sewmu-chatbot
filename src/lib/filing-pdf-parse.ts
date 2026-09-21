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
  /** ⑩필요경비 (사업장 합계) */
  expense_total?: number;
  /* ── 법인세 전용 (별지 제3호서식) ── */
  /** 101 결산서상 당기순손익 */
  net_income?: number;
  /** 102 익금산입 */
  adj_inclusion?: number;
  /** 103 손금산입 */
  adj_exclusion?: number;
  /** ⑪사업소득금액 (사업장 합계) — 종합소득금액과 다르다 (근로·기타소득이 빠진 값) */
  business_income?: number;
  tax_base?: number;
  calculated_tax?: number;
  deduction_total?: number;
  penalty_total?: number;
  decisive_tax?: number;
  prepaid_tax?: number;
  payable_tax?: number;
  farmland_tax?: number;
  /** 감면분 추가납부세액 (항번 30) — 납부할세액 검산에 필요 */
  additional_tax?: number;
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
  type: '종소세' | '법인세';
  /** 종합소득세 신고서가 아닐 때 그 이유 — 이 값이 있으면 절대 심으면 안 된다 */
  unsupported?: string;
  /** 주민번호·성명이 *** 로 가려진 출력물 — 거래처를 특정할 수 없다 */
  masked?: boolean;
  fiscal_year?: number;
  /** ⑨신고유형 코드 — 11 자기조정 / 12 외부조정 / 14 성실신고확인 / 20 간편장부 / 31 추계-기준율 / 32 추계-단순율 */
  filing_type_code?: string;
  /** 위 코드의 사람이 읽는 이름. 모르는 코드면 undefined */
  filing_type_label?: string;
  owner: ParsedFilingOwner;
  fields: ParsedFilingFields;
  checks: FilingCheck[];
  /** 값이 없어 아예 돌리지 못한 검산 — 통과가 아니다 */
  skipped_checks: string[];
  /** 검산 전부 통과 + 건너뛴 검산 없음 + 필수 항목 존재 */
  ok: boolean;
  /** ok=false 인 이유 (사람이 읽는 문장) */
  problems: string[];
}

/* ── 유틸 ── */

const toNum = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined) return null;
  /* 환급은 서식에 "-2,170,117" 또는 "△2,170,117" 로 찍힌다. 부호를 버리면
     환급 거래처가 납부로 뒤집혀 들어간다 (실측 확인). */
  const n = Number(String(s).replace(/[△▲]/g, '-').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** 금액 토큰 (환급 부호 포함). 사업자번호 안 하이픈을 음수로 오인하지 않는다. */
const AMOUNT = '[-△▲]?[\\d,]';

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
  const re = new RegExp('(?:^|\\s)' + no + '\\s+(' + AMOUNT + '+)');
  for (const ln of lines) {
    /* 서식 제목 "(2025년 귀속) 종합소득세…" 은 세액계산 행이 아니다.
       브라우저(pdf.js)로 뽑으면 연도가 "20 25" 로 갈라져 나오는 출력물이 있어,
       걸러내지 않으면 항목번호 20(소득공제) 의 금액이 25 로 잡힌다 (실측 확인). */
    if (squash(ln).includes('년귀속')) continue;
    const m = ln.match(re);
    if (m) return toNum(m[1]);
  }
  return null;
}

/**
 * 라벨로 금액을 찾는다 — 위하고 출력물용.
 *
 * 위하고는 항목번호를 인쇄하지 않는 대신 라벨이 한 줄에 온전히 들어간다.
 * (홈택스는 반대로 번호는 있지만 라벨이 두 줄로 쪼개진다.)
 * exclude 로 비슷한 라벨을 배제한다 — "산출세액" 이 "종합소득산출세액" 에 걸리는 식.
 */
function byLabel(lines: string[], label: string, exclude: string[] = []): number | null {
  for (const ln of lines) {
    const sqln = squash(ln);
    if (!sqln.includes(label)) continue;
    if (exclude.some((x) => sqln.includes(x))) continue;
    const nums = Array.from(ln.matchAll(new RegExp('(^|[^\\d])(' + AMOUNT + '{3,})', 'g')))
      .map((m) => toNum(m[2])).filter((n): n is number => n !== null);
    if (nums.length) return nums[0];   /* 첫 칸 = 종합소득세. 뒤는 농특세 */
  }
  return null;
}

/** 번호 우선, 없으면 라벨 — 홈택스/위하고 양쪽 대응 */
function pick(lines: string[], no: number, label: string, exclude: string[] = []): number | null {
  return byItemNo(lines, no) ?? byLabel(lines, label, exclude);
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

/** ⑨신고유형 코드 → 이름. 서식 1면에 인쇄된 코드 그대로. */
export const FILING_TYPE_LABEL: Record<string, string> = {
  '11': '자기조정',
  '12': '외부조정',
  '13': '성실납세',
  '14': '성실신고확인',
  '20': '간편장부',
  '31': '추계-기준율',
  '32': '추계-단순율',
  '35': '분리과세',
  '40': '비사업자',
};

/* ── 본체 ── */

export function parseFilingText(text: string): ParsedFiling {
  const lines = String(text || '').split('\n');
  const sq = lines.map(squash);
  const fields: ParsedFilingFields = {};
  const owner: ParsedFilingOwner = {};
  const problems: string[] = [];

  /* ── 서식 판별 ──
     종합소득세(별지 제40호서식) 외의 서식을 그대로 읽으면 엉뚱한 칸이 세금 숫자로
     들어간다. 실제로 법인세 신고서(별지 제1호서식) 2건에서 과세표준 72원·추가납부
     73원 같은 값이 만들어졌고 검산 하나가 우연히 통과했다. 읽기 전에 끊는다. */
  const head = sq.slice(0, 200).join('|');
  /* 법인세(별지 제1호서식) 는 서식이 통째로 달라 전용 파서로 보낸다 */
  if (/법인세과세표준및세액신고서|법인세법시행규칙\[별지제1호서식\]/.test(head)) {
    return parseCorpFiling(lines, sq);
  }
  const UNSUPPORTED: Array<[RegExp, string]> = [
    [/부가가치세.{0,6}(확정|예정)신고서|부가가치세법시행규칙\[별지제21호서식\]/, '부가가치세 신고서입니다 — 아직 종합소득세 신고서만 읽습니다'],
    [/원천징수이행상황신고서/, '원천징수이행상황신고서입니다 — 아직 종합소득세 신고서만 읽습니다'],
  ];
  for (const [re, why] of UNSUPPORTED) {
    if (re.test(head)) {
      return {
        type: '종소세', unsupported: why, owner: {}, fields: {},
        checks: [], skipped_checks: [], ok: false, problems: [why],
      };
    }
  }
  if (!/종합소득세.{0,10}농어촌특별세|과세표준확정신고및납부계산서/.test(head)) {
    const why = '종합소득세 신고서(별지 제40호서식)가 아닙니다';
    return {
      type: '종소세', unsupported: why, owner: {}, fields: {},
      checks: [], skipped_checks: [], ok: false, problems: [why],
    };
  }

  /* 귀속연도 — "(2025년귀속)" */
  let fiscal_year: number | undefined;
  let filing_type_code: string | undefined;
  for (const l of sq) {
    const m = l.match(/\((20\d{2})년귀속\)/);
    if (m) { fiscal_year = Number(m[1]); break; }
  }

  /* ⑨신고유형 — 라벨 뒤 첫 2자리가 선택된 코드. 50건 결과를 유형별로 묶기 위해 읽는다.
     (코드 목록 자체가 그 줄 아래에 또 인쇄되므로 "라벨 같은 줄" 로 한정) */
  for (const ln of lines) {
    const m = ln.match(/⑨\s*신\s*고\s*유\s*형\s+(\d{2})\b/);
    if (m) {
      filing_type_code = m[1];
      break;
    }
  }

  /* ❹ 세액의 계산 — 항목번호 앵커 */
  const put = (k: keyof ParsedFilingFields, v: number | null) => {
    if (v !== null) (fields as Record<string, unknown>)[k] = v;
  };
  const calc = taxCalcSection(lines, sq);
  put('total_income', pick(calc, 19, '종합소득금액'));
  put('income_deduction', pick(calc, 20, '소득공제'));
  /* '과세표준' 은 서식 제목("과세표준확정신고및납부계산서")에도 들어 있어
     제목줄의 연도(2025)를 금액으로 읽어버린다 — 제목 계열을 배제한다. */
  put('tax_base', pick(calc, 21, '과세표준', ['확정신고', '계산서', '신고서']));
  put('calculated_tax', pick(calc, 23, '산출세액'));

  /* 세액감면(24)·세액공제(25) 는 따로 들고 있는다.
     공제 내역 목록은 ⑬세액공제명세서 구간에서만 긁으므로, 내역 합은
     '공제(25)' 하고만 맞춰야 한다. 합계(감면+공제)와 비교하면 감면 받은
     거래처가 구조적으로 전부 반려된다. */
  const 감면 = pick(calc, 24, '세액감면');
  const 공제 = pick(calc, 25, '세액공제');
  if (감면 !== null || 공제 !== null) fields.deduction_total = (감면 ?? 0) + (공제 ?? 0);

  /* 결정세액 — 홈택스는 항번 28, 위하고는 "합계" 줄. 위하고의 "합계" 는 여러 번
     나오므로 종합과세 줄을 먼저 본다. */
  put('decisive_tax', byItemNo(calc, 28) ?? byLabel(calc, '종합과세') ?? byLabel(calc, '합계'));
  /* ?? 0 을 쓰지 않는다 — 못 읽었을 때 0 이 들어가면 "값 없어 못 돌린 검산은
     통과가 아니다" 원칙이 이 필드에만 무력해지고, 챗봇이 "가산세 0원" 이라 단정한다. */
  put('penalty_total', pick(calc, 29, '가산세'));
  put('additional_tax', pick(calc, 30, '추가납부세액'));
  put('prepaid_tax', pick(calc, 32, '기납부세액'));
  put('payable_tax',
    byItemNo(calc, 33) ?? byItemNo(calc, 37)
    ?? byLabel(calc, '신고기한내납부할세액') ?? byLabel(calc, '납부(환급)할총세액'));

  /* 농어촌특별세 — 오른쪽 열 항번 53 */
  for (const ln of calc) {
    const m = ln.match(new RegExp('\\s53\\s+(' + AMOUNT + '+)'));
    if (m) { put('farmland_tax', toNum(m[1])); break; }
  }

  /* ❼ 사업소득명세서의 가로 한 줄 — 사업장이 여러 개면 나란히 찍히므로 전부 합산.
     위하고 출력물은 사업장 칸 뒤에 "계" 칸이 하나 더 붙는다. 그대로 합치면 2배가
     되므로, 마지막 숫자가 나머지의 합이면 그것을 계로 보고 채택한다. 단 매출이 같은
     사업장 2곳이면 우연히 참이 되어 절반이 되므로, 실제로 "계" 열이 있을 때만 쓴다
     ("계" 열 머리글은 ②일련번호 줄에 있다). */
  const sumRow = (anchor: RegExp): number | undefined => {
    for (let i = 0; i < lines.length; i++) {
      if (!anchor.test(sq[i])) continue;
      const nums = (lines[i].match(/[\d,]{4,}/g) || []).map(toNum).filter((n): n is number => n !== null);
      if (!nums.length) continue;
      const hasTotalColumn = sq
        .slice(Math.max(0, i - 20), i + 1)
        .some((l) => /일련번호/.test(l) && /(^|[^가-힣])계($|[^가-힣])/.test(l));
      const last = nums[nums.length - 1];
      const rest = nums.slice(0, -1).reduce((a, b) => a + b, 0);
      return hasTotalColumn && nums.length > 1 && last === rest ? last : nums.reduce((a, b) => a + b, 0);
    }
    return undefined;
  };

  /* ⑨총수입금액. 줄 아무데나 '총수입금액' 이 있으면 잡던 것 → 가산세 기준칸
     ("공동사업장등록 불성실 … 총수입금액 0.5/100") 이나 표 머리글까지 걸린다.
     ⑮조정후총수입금액 은 ❼명세서가 비어 있는 부동산임대 신고서의 대체 칸이다. */
  fields.revenue = sumRow(/^[⑧⑨]?\s*총수입금액/) ?? (() => {
    /* ❼명세서가 비어 있는 출력물(부동산임대 등) 대체 칸. 사업장마다 조정후총수입금액
       명세서가 따로 붙으므로 첫 장만 쓰면 사업장 하나치만 매출로 잡힌다 —
       실측: 12,000,000 만 잡히고 483,487,698 이 빠졌다. 전부 더한다. */
    const each = lines
      .filter((_, i) => /^⑮?조정후총수입금액/.test(sq[i]))
      .map((ln) => (ln.match(/[\d,]{4,}/g) || [])[0])
      .map(toNum)
      .filter((n): n is number => n !== null);
    return each.length ? each.reduce((a, b) => a + b, 0) : undefined;
  })();
  /* ⑩필요경비 · ⑪소득금액 — 이걸 읽어야 수입금액에 검산이 걸린다.
     안 걸어두면 매출만 조용히 틀린 채 통과한다 (다른 검산은 전부 세액 쪽이라
     매출이 어긋나도 4/4 통과가 나온다 — 실측 확인). */
  fields.expense_total = sumRow(/^[⑨⑩]?\s*필요경비/);
  fields.business_income = sumRow(/^[⑩⑪]?\s*소득금액\(/);

  /* ⑬ 세액공제명세서 ~ ⑭ 준비금명세서 구간 안에서만 공제 항목을 찾는다.
     문서 전체를 훑으면 손익계산서 항목을 공제로 오인한다 (실측 확인). */
  fields.공제감면 = (() => {
    const start = sq.findIndex((l) => l.includes('세액공제명세서'));
    if (start < 0) return [];
    let end = sq.findIndex((l, i) => i > start && l.includes('준비금명세서'));
    if (end < 0) end = Math.min(lines.length, start + 120);

    const list: DeductionItem[] = [];
    for (const raw of lines.slice(start, end)) {
      /* 적용률 칸("12%", "(15%)", "40%)", "12/100") 과 ④사업자등록번호 칸을 먼저 지운다.
         안 지우면 공제대상금액 다음 숫자인 적용률이 세액공제액으로 잡혀
         보장성 120,000 이 12(%) 로, 일반기부금 7,500 이 40(%) 으로 들어간다 (실측 확인). */
      const ln = raw
        .replace(/\d{3}-\d{2}-\d{5}/g, ' ')
        .replace(/\(?\s*\d+(?:\.\d+)?\s*%\s*[,)]?/g, ' ')
        .replace(/\d+\s*\/\s*\d{2,3}(?!\d)/g, ' ');
      /* "<항목명> <코드> <공제대상금액> <세액공제액>" 또는 "<항목명> <코드> <세액공제액>" */
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
  /* 성명 — 홈택스는 "①성 명", 위하고는 "1 성      명". 세무대리인 칸(⑬성명)에도
     같은 모양이 나오므로 기본사항 구간이 먼저 오는 것을 이용해 첫 매치만 쓴다.
     브라우저(pdf.js)로 뽑으면 서식의 자간이 살아나 "이 재 윤" 처럼 한 글자씩
     떨어져 나온다. \S+ 로 받으면 "이" 만 잡혀 거래처 매칭이 통째로 틀어지므로
     한 글자 + 공백 하나의 반복으로 받아 붙인다. */
  /* 홈택스 "개인정보 보호" 출력물은 성명을 "권***", 주민번호를 "920121-*******"
     로 가려서 찍는다. 이러면 거래처를 특정할 방법이 아예 없다 — "못 읽었다" 가 아니라
     "가려져 있다" 고 말해야 사장님이 다시 뽑는다. */
  let masked = false;
  for (const ln of lines) {
    const m = ln.match(/(?:①|(?:^|\s)1)\s*성\s*명\s+((?:[가-힣][ ]?){2,8})/)
      || ln.match(/성\s+명\s{2,}((?:[가-힣][ ]?){2,5})\s{2,}②/);
    if (m) { owner.name = m[1].replace(/\s+/g, ''); break; }
    if (/(?:①|(?:^|\s)1)\s*성\s*명\s+[가-힣]*\*{2,}/.test(ln)) { masked = true; break; }
  }
  /* 주민번호: 앞 6 + 뒤 첫 자리만 읽고 나머지는 버린다 */
  /* 주민번호 — 위하고는 "9 3 0 5 1 0 - 1 6 8 5 4 2 0" 처럼 한 글자씩 띄워 찍는다.
     숫자/하이픈만 남기고 비교한다. 앞 6 + 세기 1자리만 쓰고 나머지는 버린다. */
  for (const ln of lines) {
    if (!squash(ln).includes('주민등록번호')) continue;
    const digits = ln.replace(/[^\d-]/g, '');
    const m = digits.match(/(\d{6})-(\d)\d{6}/);
    if (m) { owner.birth_date = rrnToBirthDate(m[1], m[2]) ?? undefined; break; }
  }
  if (!owner.birth_date) {
    for (const ln of lines) {
      const m = ln.match(/\b(\d{6})\s*-\s*(\d)\d{6}\b/);
      if (m) { owner.birth_date = rrnToBirthDate(m[1], m[2]) ?? undefined; break; }
    }
  }
  if (!owner.birth_date && lines.some((l) => /\d{6}\s*-\s*\*{3,}/.test(l))) masked = true;
  if ((owner.company_name || '').includes('**')) { masked = true; owner.company_name = undefined; }
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
  outer: for (const rawLn of bizSection) {
    /* 위하고 자간 제거. lookbehind 는 구형 Safari(iOS ≤16.3)가 파싱조차 못 해
       공용 번들 전체가 SyntaxError 로 죽는다 — 캡처 그룹으로 대체. */
    const ln = rawLn.replace(/([\d-])\s+(?=[\d-])/g, '$1');
    for (const m of ln.matchAll(/(\d{3})-(\d{2})-(\d{5})/g)) {
      const bn = m[1] + m[2] + m[3];
      if (/^0+$/.test(bn)) continue;         /* 000-00-00000 = 사업자등록 없는 인적용역 */
      owner.biz_no = bn;
      break outer;
    }
  }
  /* 상호 — pdf.js 로 뽑으면 자간 때문에 "세 무회 계  이윤" 처럼 갈라진다.
     칸 경계는 5칸 이상 띄움으로 잡고 (상호 안의 자간이 3칸까지 벌어진 출력물이 있다),
     남은 자간은 전부 없애 두 경로가 같은 값을 내도록 한다
     (표시용이라 띄어쓰기보다 일관성이 중요하다). */
  /* 사업장이 둘 이상이면 "상호" 하나로 특정할 수 없다. 게다가 브라우저 추출에서는
     칸이 두 줄인 상호끼리 글자가 섞여 나온다("경산중휴산대펜폰타성힐지즈옆점커폰").
     여러 개면 아예 비워 둔다 — 틀린 상호를 보여주는 것보다 낫다. */
  const 사업장수 = (() => {
    for (const rawLn of bizSection) {
      if (!squash(rawLn).startsWith('⑤사업자등록번호')) continue;
      const ln = rawLn.replace(/([\d-])\s+(?=[\d-])/g, '$1');
      const all = Array.from(ln.matchAll(/(\d{3})-(\d{2})-(\d{5})/g))
        .map((m) => m[1] + m[2] + m[3])
        .filter((bn) => !/^0+$/.test(bn));
      return all.length;
    }
    return 0;
  })();
  if (사업장수 <= 1) {
    for (const ln of bizSection.length ? bizSection : lines) {
      const m = ln.match(/④\s*상\s*호\s+(\S.*?)(?:\s{5,}|\s*$)/);
      if (m) { owner.company_name = squash(m[1]); break; }
    }
  }

  /* ── 검산 ── */
  const checks: FilingCheck[] = [];
  const skipped: string[] = [];
  /**
   * 값이 없어서 "검증을 못 한 것" 과 "검증해서 맞은 것" 은 다르다.
   * 조용히 건너뛰면 미검증 숫자가 통과한다 — 실제로 기납부세액이 비어 있던
   * 출력물에서 틀린 납부할세액이 검산 없이 통과할 뻔했다. 건너뛴 것도 남긴다.
   */
  const add = (label: string, a?: number, b?: number) => {
    if (a === undefined || b === undefined) { skipped.push(label); return; }
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
  /* 서식상 33 = 31 − 32 이고 31 = 28 + 29 + 30 이다.
     가산세(29)를 빼먹고 검산하면 가산세가 붙은 정상 신고서가 전부 반려된다. */
  add(
    '사업소득금액 = 총수입금액 − 필요경비',
    fields.business_income,
    fields.revenue !== undefined && fields.expense_total !== undefined
      ? fields.revenue - fields.expense_total : undefined,
  );
  add(
    '납부할세액 = 결정세액 + 가산세 + 추가납부 − 기납부세액',
    fields.payable_tax,
    fields.decisive_tax !== undefined && fields.prepaid_tax !== undefined
      ? fields.decisive_tax + (fields.penalty_total ?? 0) + (fields.additional_tax ?? 0) - fields.prepaid_tax
      : undefined,
  );
  /* 내역 목록은 ⑬세액공제명세서 구간에서만 긁으므로 '세액공제(25)' 와만 맞춘다.
     감면(24)은 ⑫세액감면명세서에 따로 있어 목록에 안 들어온다. */
  if (fields.공제감면 && fields.공제감면.length) {
    add(
      '공제 내역 합 = 세액공제(감면 제외)',
      fields.공제감면.reduce((s, d) => s + d.amount, 0),
      공제 ?? undefined,
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
  if (masked) {
    problems.push('마스킹된 출력물입니다 (성명·주민번호가 *** 로 가려짐) — 거래처를 특정할 수 없습니다. 홈택스에서 마스킹 없이 다시 내려받아 주세요');
  } else if (!owner.name) {
    problems.push('성명을 못 읽었습니다');
  }
  for (const c of checks) {
    if (!c.ok) problems.push(`검산 불일치 — ${c.label} (차이 ${(c.diff ?? 0).toLocaleString('ko-KR')}원)`);
  }
  for (const label of skipped) {
    problems.push(`검산 못 함 (값 누락) — ${label}`);
  }
  if (!checks.length) problems.push('검산할 수 있는 항목이 없습니다');

  return {
    type: '종소세',
    fiscal_year,
    filing_type_code,
    filing_type_label: filing_type_code ? FILING_TYPE_LABEL[filing_type_code] : undefined,
    owner,
    fields,
    checks,
    skipped_checks: skipped,
    ok: problems.length === 0,
    problems,
    ...(masked ? { masked: true } : {}),
  };
}


/* ══════════════════════════════════════════════════════════════════════
   법인세 — 별지 제1호서식(신고서) + 별지 제3호서식(세액조정계산서)

   종소세와 달리 라벨이 아니라 "일련번호" 로 읽는다. 조정계산서는 행마다
   01~64 의 일련번호가 있고 그 바로 뒤가 금액이라, 라벨이 두 줄로 쪼개지거나
   좌·우 두 칸이 한 줄에 나란히 찍혀도 흔들리지 않는다.
   서식 안 계산식은 전부 세 자리 코드(101＋102－103)로 쓰여 있어
   일련번호와 섞이지 않는다.
   ══════════════════════════════════════════════════════════════════════ */

/** 조정계산서 구간에서 일련번호 뒤 금액을 읽는다 */
function bySeq(lines: string[], seq: number): number | null {
  const re = new RegExp('(?:^|\\s)' + String(seq).padStart(2, '0') + '\\s+(' + AMOUNT + '+)');
  for (const ln of lines) {
    const m = ln.match(re);
    if (m) {
      const n = toNum(m[1]);
      if (n !== null) return n;
    }
  }
  return null;
}

function parseCorpFiling(lines: string[], sq: string[]): ParsedFiling {
  const fields: ParsedFilingFields = {};
  const owner: ParsedFilingOwner = {};
  const problems: string[] = [];

  /* ── 1면 (별지 제1호서식) ── */
  const calcStart = sq.findIndex((l) => l.includes('세액조정계산서'));
  const head = lines.slice(0, calcStart > 0 ? calcStart : lines.length);
  let masked = false;
  for (const ln of head) {
    const s = squash(ln);
    if (!owner.company_name) {
      /* 칸 경계는 5칸 이상 띄움 — 브라우저(pdf.js)로 뽑으면 법인명 안 자간이 3칸까지
         벌어져 "주식회사" 에서 잘린다. 자간은 한 칸으로 줄여 DB 회사명과 맞춘다. */
      const m = ln.match(/법\s*인\s*명\s{2,}(\S.*?)(?:\s{5,}|\s*$)/);
      if (m && s.startsWith('법인명')) owner.company_name = m[1].trim().replace(/\s+/g, ' ');
    }
    if (!owner.name) {
      const m = ln.match(/대\s*표\s*자\s*성\s*명\s{2,}(\S.*?)(?:\s{5,}|\s*$)/);
      if (m) owner.name = squash(m[1]);
    }
    /* ⚠ 사업자등록번호는 "법인등록번호와 같은 줄" 로만 읽는다. 문서 뒤쪽 조정자 칸에
       세무사 사무실 번호가 찍혀 있어, 그냥 훑으면 마스킹된 신고서에서 거래처 번호
       대신 세무회계 이윤 번호(549-79-00291)를 잡는다 (실측 확인). */
    if (!owner.biz_no && s.includes('법인등록번호')) {
      const m = ln.match(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})/);
      if (m) owner.biz_no = m[1] + m[2] + m[3];
    }
    if (fields.revenue === undefined && /^수입금액[(（]/.test(s)) {
      const m = ln.match(new RegExp('(' + AMOUNT + '{4,})'));
      if (m) { const n = toNum(m[1]); if (n !== null) fields.revenue = n; }
    }
  }
  /* 조정계산서 머리글에도 법인의 사업자등록번호가 한 번 더 찍힌다 (1면이 안 읽힐 때 대비) */
  if (!owner.biz_no && calcStart >= 0) {
    for (const ln of lines.slice(calcStart, calcStart + 4)) {
      if (!squash(ln).includes('사업자등록번호')) continue;
      const m = ln.match(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})/);
      if (m) { owner.biz_no = m[1] + m[2] + m[3]; break; }
    }
  }
  /* 마스킹 출력물 — 사업자번호·법인명이 *** 로 가려지면 어느 법인인지 특정할 수 없다 */
  if (!owner.biz_no && head.some((l) => /\d{3}\s*-\s*\d{2}\s*-\s*\d*\*{2,}/.test(l))) masked = true;
  if ((owner.company_name || '').includes('**')) { masked = true; owner.company_name = undefined; }

  /* 사업연도 → 귀속연도. "2025.03.12 ~ 2025.12.31" 의 종료연도를 쓴다
     (신설·폐업 법인은 개시연도와 다를 수 있다). */
  let fiscal_year: number | undefined;
  for (const ln of head) {
    const m = ln.match(/(20\d{2})\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}\s*~\s*(20\d{2})/);
    if (m) { fiscal_year = Number(m[2]); break; }
  }
  if (!fiscal_year) {
    for (const l of sq) {
      const m = l.match(/~(20\d{2})[.\-/]\d{1,2}[.\-/]\d{1,2}/);
      if (m) { fiscal_year = Number(m[1]); break; }
    }
  }

  /* ── 별지 제3호서식 세액조정계산서 ── */
  const calc = (() => {
    const start = sq.findIndex((l) => l.includes('세액조정계산서'));
    if (start < 0) return [];
    let end = sq.findIndex((l, i) => i > start && /별지제2호서식|농어촌특별세과세표준/.test(l));
    if (end < 0) end = Math.min(lines.length, start + 140);
    return lines.slice(start, end);
  })();

  const put = (k: keyof ParsedFilingFields, v: number | null) => {
    if (v !== null) (fields as Record<string, unknown>)[k] = v;
  };
  put('net_income', bySeq(calc, 1));        /* 101 결산서상 당기순손익 */
  put('adj_inclusion', bySeq(calc, 2));     /* 102 익금산입 */
  put('adj_exclusion', bySeq(calc, 3));     /* 103 손금산입 */
  put('business_income', bySeq(calc, 6));   /* 107 각 사업연도 소득금액 */
  put('tax_base', bySeq(calc, 56) ?? bySeq(calc, 10)); /* 113 과세표준(112+159), 없으면 112 */
  put('calculated_tax', bySeq(calc, 16));   /* 119 합계(115+118) = 산출세액 */
  put('penalty_total', bySeq(calc, 20));    /* 124 가산세액 */
  put('decisive_tax', bySeq(calc, 21));     /* 125 가감계 = 총부담세액 */
  put('prepaid_tax', bySeq(calc, 28));      /* 132 기납부세액 합계 */
  put('additional_tax', bySeq(calc, 29));   /* 133 감면분 추가납부세액 */
  put('payable_tax', bySeq(calc, 30));      /* 134 차감납부할세액 */

  /* 공제·감면은 최저한세 적용대상(121)·적용제외(123) 둘로 나뉜다 — 합계로 본다 */
  const 공제1 = bySeq(calc, 17);
  const 공제2 = bySeq(calc, 19);
  if (공제1 !== null || 공제2 !== null) fields.deduction_total = (공제1 ?? 0) + (공제2 ?? 0);

  /* ── 검산 ── */
  const checks: FilingCheck[] = [];
  const skipped: string[] = [];
  const add = (label: string, a?: number | null, b?: number | null) => {
    if (a === undefined || a === null || b === undefined || b === null) { skipped.push(label); return; }
    checks.push({ label, ok: a === b, ...(a === b ? {} : { diff: a - b }) });
  };
  const 차가감 = bySeq(calc, 4);            /* 104 */
  const 기부금한도초과 = bySeq(calc, 5);     /* 105 */
  const 기부금이월손금 = bySeq(calc, 54);    /* 106 */
  const 이월결손금 = bySeq(calc, 7);         /* 109 */
  const 비과세 = bySeq(calc, 8);             /* 110 */
  const 소득공제 = bySeq(calc, 9);           /* 111 */
  const 차감세액 = bySeq(calc, 18);          /* 122 */

  add('차가감소득금액 = 당기순이익 + 익금산입 − 손금산입', 차가감,
    fields.net_income !== undefined && fields.adj_inclusion !== undefined && fields.adj_exclusion !== undefined
      ? fields.net_income + fields.adj_inclusion - fields.adj_exclusion : undefined);
  add('각사업연도소득금액 = 차가감소득금액 + 기부금한도초과 − 기부금이월손금산입',
    fields.business_income,
    차가감 !== null ? 차가감 + (기부금한도초과 ?? 0) - (기부금이월손금 ?? 0) : undefined);
  add('과세표준 = 각사업연도소득금액 − 이월결손금 − 비과세 − 소득공제',
    fields.tax_base,
    fields.business_income !== undefined
      ? fields.business_income - (이월결손금 ?? 0) - (비과세 ?? 0) - (소득공제 ?? 0) : undefined);
  add('차감세액 = 산출세액 − 최저한세 적용대상 공제·감면', 차감세액,
    fields.calculated_tax !== undefined && 공제1 !== null ? fields.calculated_tax - 공제1 : undefined);
  add('총부담세액 = 차감세액 − 최저한세 적용제외 공제·감면 + 가산세',
    fields.decisive_tax,
    차감세액 !== null ? 차감세액 - (공제2 ?? 0) + (fields.penalty_total ?? 0) : undefined);
  add('납부할세액 = 총부담세액 − 기납부세액 + 감면분추가납부',
    fields.payable_tax,
    fields.decisive_tax !== undefined && fields.prepaid_tax !== undefined
      ? fields.decisive_tax - fields.prepaid_tax + (fields.additional_tax ?? 0) : undefined);

  const REQUIRED: Array<[keyof ParsedFilingFields, string]> = [
    ['net_income', '결산서상 당기순이익'],
    ['business_income', '각사업연도소득금액'],
    ['tax_base', '과세표준'],
    ['decisive_tax', '총부담세액'],
  ];
  for (const [k, label] of REQUIRED) {
    if (fields[k] === undefined) problems.push(`${label}을(를) 못 읽었습니다`);
  }
  /* 매출액(1면 수입금액)은 조정계산서 어느 식에도 안 들어가 검산이 안 걸린다.
     못 읽으면 조용히 비는 편이 틀린 값보다 낫다. */
  if (fields.revenue === undefined) problems.push('매출액(1면 수입금액)을 못 읽었습니다');
  if (!fiscal_year) problems.push('사업연도를 못 읽었습니다');
  if (masked) {
    problems.push('마스킹된 출력물입니다 (사업자등록번호·법인명이 *** 로 가려짐) — 거래처를 특정할 수 없습니다. 마스킹 없이 다시 내려받아 주세요');
  } else if (!owner.biz_no && !owner.company_name) {
    problems.push('법인 사업자등록번호·법인명을 못 읽었습니다');
  }
  for (const c of checks) {
    if (!c.ok) problems.push(`검산 불일치 — ${c.label} (차이 ${(c.diff ?? 0).toLocaleString('ko-KR')}원)`);
  }
  for (const label of skipped) problems.push(`검산 못 함 (값 누락) — ${label}`);
  if (!checks.length) problems.push('검산할 수 있는 항목이 없습니다');

  return {
    type: '법인세', fiscal_year, owner, fields, checks,
    skipped_checks: skipped, ok: problems.length === 0, problems,
    ...(masked ? { masked: true } : {}),
  };
}

declare global {
  interface Window {
    __parseFilingText?: typeof parseFilingText;
  }
}
if (typeof window !== 'undefined') window.__parseFilingText = parseFilingText;
