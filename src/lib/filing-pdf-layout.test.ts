/**
 * admin.js 의 _fpLayout — pdf.js 글자 조각을 pdftotext -layout 모양의 줄로 되돌린다.
 *
 * 왜 여기서 지키나: 신고서 PDF 를 admin 에 직접 올리는 경로는 이 함수가 만든
 * 줄 텍스트를 filing-pdf-parse 에 넘긴다. 줄 모양이 한 칸만 어긋나도
 * 세금 숫자가 통째로 틀어진다 (실제 신고서 2종에서 아래 3가지를 다 겪었다).
 *
 * admin.js 는 classic script 라 import 할 수 없어 소스에서 함수만 떼어 평가한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

type Item = { str: string; width: number; height: number; transform: number[] };

const layout: (items: Item[]) => string = (() => {
  const src = readFileSync('admin.js', 'utf8');
  const a = src.indexOf('function _fpLayout(items){');
  const b = src.indexOf('async function _fpPdfText(');
  if (a < 0 || b < 0) throw new Error('admin.js 에서 _fpLayout 를 못 찾았다');
  return new Function(src.slice(a, b) + '\nreturn _fpLayout;')() as (items: Item[]) => string;
})();

/** pdf.js 조각 한 개 */
const cell = (str: string, x: number, y: number, width: number, height = 10): Item =>
  ({ str, width, height, transform: [1, 0, 0, height, x, y] });

/** 글자 하나씩 쪼개진 조각들 (pdf.js 가 자주 이렇게 준다) */
function glyphs(text: string, x0: number, y: number, w: number, pitch: number): Item[] {
  return text.split('').map((ch, i) => cell(ch, x0 + pitch * i, y, w, 9));
}

describe('_fpLayout — 칸 간격', () => {
  it('떨어져 있는 두 금액을 붙여 쓰지 않는다', () => {
    const out = layout([
      cell('과세표준', 60, 500, 40),
      cell('11,023', 200, 500, 30, 9),
      cell('143,541', 300, 500, 35, 9),
    ]);
    expect(out).not.toContain('11,023143,541');
    expect(out.match(/[\d,]{3,}/g)).toEqual(['11,023', '143,541']);
  });

  it('한 금액이 글자 단위로 쪼개져 와도 하나로 붙인다', () => {
    /* 실제 위하고 출력물의 값: 글자 폭 4.3, 글자 간격 4.5 */
    const out = layout([
      cell('총수입금액', 60, 500, 50),
      ...glyphs('544,917,434', 300, 500, 4.3, 4.5),
    ]);
    expect(out).toContain('544,917,434');
  });

  it('두 줄 높이 칸에서 기준선이 조금 어긋나도 한 줄로 묶는다', () => {
    /* 홈택스 출력물 실측: 라벨 322.58 / 항번 319.72 / 금액 318.75 */
    const out = layout([
      cell('추가납부세액', 110, 322.58, 36, 6),
      cell('30', 235, 319.72, 7, 6),
      cell('0', 375, 318.75, 5, 9),
      cell('48', 393, 319.72, 7, 6),
      cell('0', 530, 318.75, 5, 9),
    ]);
    const line = out.split('\n').find((l) => l.includes('30')) ?? '';
    /* 파서가 "항번 다음 숫자" 로 읽는다 — 옆 칸 항번 48 이 아니라 0 이어야 한다 */
    expect(line.match(/(?:^|\s)30\s+([\d,]+)/)?.[1]).toBe('0');
  });

  it('줄은 위에서 아래로 나온다', () => {
    const out = layout([cell('아래', 60, 100, 40), cell('위', 60, 500, 40)]);
    expect(out.split('\n').map((l) => l.trim())).toEqual(['위', '아래']);
  });
});

/* 2026-09-18: 실제 브라우저로 올려 보니 새로 추가한 필드가 라벨 없이
   "expense_total 23,252,394" 처럼 영문 키 그대로 화면에 나왔다.
   파서가 내보낼 수 있는 키는 전부 한글 라벨이 있어야 한다. */
describe('admin 미리보기 — 필드 라벨', () => {
  const src = readFileSync('admin.js', 'utf8');
  const labelKeys = (name: string): string[] => {
    const i = src.indexOf(`var ${name}=`);
    if (i < 0) throw new Error(`${name} 를 admin.js 에서 못 찾았다`);
    const body = src.slice(i, src.indexOf('};', i));
    /* 키는 revenue: 처럼도, '공제감면': 처럼 따옴표로도 쓰여 있다 */
    return Array.from(body.matchAll(/['"]?([A-Za-z_가-힣]+)['"]?\s*:/g)).map((m) => m[1]);
  };
  const labelled = new Set([...labelKeys('_FJ_LABEL'), ...labelKeys('_FP_LABEL_PERSON')]);

  it('파서가 내보내는 모든 필드에 한글 라벨이 있다', () => {
    const parserSrc = readFileSync('src/lib/filing-pdf-parse.ts', 'utf8');
    const iface = parserSrc.slice(
      parserSrc.indexOf('export interface ParsedFilingFields {'),
      parserSrc.indexOf('export interface ParsedFilingOwner'),
    );
    const fields = Array.from(iface.matchAll(/^\s{2}([A-Za-z_가-힣]+)\??:/gm)).map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(10);
    expect(fields.filter((f) => !labelled.has(f))).toEqual([]);
  });

  it('종소세에서는 business_income 을 "사업소득금액" 으로 바꿔 부른다', () => {
    /* 같은 키가 법인세에서는 각사업연도소득금액이다 — 섞이면 안 된다 */
    expect(src).toContain("_FP_LABEL_PERSON={business_income:'사업소득금액'}");
    expect(src).toContain("business_income:'각사업연도소득금액'");
  });
});

/* 2026-09-21 사장님: "사업장별 매출 이거도 해보자".
   businesses 는 배열이라 숫자 칩으로 못 뿌린다 — 칩에서 빼고 따로 줄로 그린다.
   (_fjNum 이 공제감면처럼 amount 로 더하면 전부 "0원" 으로 나온다) */
describe('admin 미리보기 — 사업장별 내역', () => {
  const src = readFileSync('admin.js', 'utf8');
  const ev = <T,>(names: string[]): T => {
    let body = '';
    for (const n of names) {
      const i = src.indexOf(`function ${n}(`);
      if (i < 0) throw new Error(`${n} 를 admin.js 에서 못 찾았다`);
      /* 함수 하나만 떼려면 다음 최상위 선언 직전까지 자른다 */
      const j = src.indexOf('\nfunction ', i + 1);
      const k = src.indexOf('\nvar ', i + 1);
      body += src.slice(i, Math.min(...[j, k].filter((x) => x > 0))) + '\n';
    }
    const code = src.slice(src.indexOf('var _FP_CODE_LABEL='), src.indexOf('\n', src.indexOf('var _FP_CODE_LABEL=')));
    return new Function(
      'var e=function(s){return String(s)};' + code + '\n' + body + '\nreturn {' + names.join(',') + '};',
    )() as T;
  };
  const { _fpBizHtml, _fjNum } = ev<{ _fpBizHtml: (l: unknown) => string; _fjNum: (v: unknown) => string }>(
    ['_fpBizHtml', '_fpBizFmt', '_fjNum'],
  );

  it('사업장 수와 각 칸의 금액이 나온다', () => {
    const html = _fpBizHtml([
      { name: '테스트상사', income_code: '40', revenue: 350_000_000, expense: 180_000_000, income: 170_000_000 },
      { biz_no: '2946300497', income_code: '32', revenue: 29_000_000 },
      { revenue: 5_000_000 },
    ]);
    expect(html).toContain('사업장별 3곳');
    expect(html).toContain('테스트상사(사업)');
    expect(html).toContain('350,000,000');
    expect(html).toContain('경비 180,000,000');
    /* 상호가 없으면 사업자등록번호를 하이픈 넣어 보여준다 */
    expect(html).toContain('294-63-00497(주택임대)');
    /* 사업자등록 없는 인적용역도 칸을 지킨다 */
    expect(html).toContain('사업자등록 없음');
  });

  it('비어 있으면 아무것도 안 그린다', () => {
    expect(_fpBizHtml(undefined)).toBe('');
    expect(_fpBizHtml([])).toBe('');
  });

  it('_fjNum 이 사업장 배열을 "N곳 수입금액 합" 으로 요약한다', () => {
    /* 금액 키가 revenue 라 공제감면 방식으로 더하면 0원이 된다 */
    expect(_fjNum([{ revenue: 350_000_000 }, { revenue: 50_000_000 }])).toBe('2곳 수입금액 합 400,000,000원');
  });

  it('_fjNum 이 공제감면 배열은 예전대로 "N건 합계" 로 요약한다', () => {
    expect(_fjNum([{ name: '전자신고', amount: 20_000 }])).toBe('1건 20,000원');
  });

  it('칩 목록에서 businesses 를 빼고 _fpBizHtml 을 붙인다', () => {
    expect(src).toContain("Object.keys(f).filter(function(k){return k!=='businesses'})");
    expect(src).toContain('+_fpBizHtml(f.businesses);');
  });
});
