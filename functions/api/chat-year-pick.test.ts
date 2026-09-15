/**
 * 연도 모호성 처리 — 2026-09-15 사장님: "올해 ㅇㅈㄹ하면 몇년도선택 이런거 띄워야겟네"
 *
 * 사고 시나리오: 2026년 9월에 거래처가 "올해 매출 얼마야" 라고 물었는데
 * 검토표에는 2025년까지만 있음 → 챗봇이 2025년 숫자를 올해 것인 양 답하면 대형 사고.
 *
 * 여기서 지키는 것:
 *  1. 보유 연도와 오늘 날짜가 프롬프트에 명시된다
 *  2. 올해 자료가 없으면 "그 해 숫자로 답하지 말라"는 금지가 들어간다
 *  3. 연도 버튼 표식 [연도선택: ...] 지시가 들어간다
 *  4. 클라이언트가 그 표식을 화면에서 걷어낸다 (사용자에게 노출 X)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ── 서버: buildFilingContext ── */
const src = readFileSync(join(__dirname, 'chat.js'), 'utf8');
const bStart = src.indexOf('const FIL_FIELDS_PERSON');
const bEnd = src.indexOf('// 승인상태별 일일 한도');
const { buildFilingContext } = new Function(
  src.slice(bStart, bEnd) + '\n; return { buildFilingContext };',
)() as { buildFilingContext: (a: unknown[], b: unknown[]) => string };

const YEAR = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
const filing = (year: number, type = '종소세') => ({
  type, fiscal_year: year, auto_fields: JSON.stringify({ revenue: 100_000_000 }),
});

describe('buildFilingContext — 연도 안내', () => {
  it('검토표가 없으면 컨텍스트 자체가 없다', () => {
    expect(buildFilingContext([], [])).toBe('');
  });

  it('보유 연도 목록과 오늘 연·월이 들어간다', () => {
    const out = buildFilingContext([filing(YEAR - 1), filing(YEAR - 2)], []);
    expect(out).toContain(`[보유 연도] ${YEAR - 1}, ${YEAR - 2}`);
    expect(out).toContain(`오늘: ${YEAR}년`);
  });

  it('연도 버튼 표식을 붙이라는 지시가 있다', () => {
    const out = buildFilingContext([filing(YEAR - 1)], []);
    expect(out).toContain(`[연도선택: ${YEAR - 1}]`);
  });

  it('올해 자료가 없으면 — 최근 연도를 올해인 양 답하지 말라는 금지가 들어간다', () => {
    const out = buildFilingContext([filing(YEAR - 1), filing(YEAR - 2)], []);
    expect(out).toContain(`${YEAR}년(올해) 확정 자료는 아직 없습니다`);
    expect(out).toContain('절대 금지');
  });

  it('올해 자료가 있으면 — 올해로 답해도 된다고 안내한다', () => {
    const out = buildFilingContext([filing(YEAR), filing(YEAR - 1)], []);
    expect(out).toContain(`${YEAR}년 자료는 보유하고 있으므로`);
    expect(out).not.toContain('확정 자료는 아직 없습니다');
  });

  it('"작년/재작년"은 되묻지 않고 바로 답하도록 확정 해석된다', () => {
    const out = buildFilingContext([filing(YEAR - 1)], []);
    expect(out).toContain(`"작년"은 ${YEAR - 1}년`);
    expect(out).toContain(`"재작년"은 ${YEAR - 2}년`);
  });

  it('법인 검토표 연도도 보유 연도에 합쳐진다', () => {
    const out = buildFilingContext([filing(YEAR - 1)], [filing(YEAR - 3, '법인세')]);
    expect(out).toContain(`[보유 연도] ${YEAR - 1}, ${YEAR - 3}`);
  });

  it('같은 연도에 부가세·종소세가 있어도 연도는 한 번만 나온다', () => {
    const out = buildFilingContext([filing(YEAR - 1, '종소세'), filing(YEAR - 1, '부가세')], []);
    expect(out).toContain(`[보유 연도] ${YEAR - 1} `);
  });
});

/* ── 클라이언트: _stripYearPick / _stripYear ── */
const cli = readFileSync(join(__dirname, '..', '..', 'index.js'), 'utf8');
const cStart = cli.indexOf('var _YEAR_PICK_RE');
const cEnd = cli.indexOf('function askQuick');
const { _stripYearPick, _stripYear } = new Function(
  cli.slice(cStart, cEnd) + '\n; return { _stripYearPick, _stripYear };',
)() as {
  _stripYearPick: (t: string) => { text: string; years: number[] };
  _stripYear: (q: string) => string;
};

describe('_stripYearPick — 표식은 감추고 연도만 뽑는다', () => {
  it('표식을 화면 텍스트에서 걷어낸다', () => {
    const r = _stripYearPick('어느 연도로 알려드릴까요?\n[연도선택: 2025, 2024]');
    expect(r.text).toBe('어느 연도로 알려드릴까요?');
    expect(r.years).toEqual([2025, 2024]);
  });

  it('표식이 없으면 원문 그대로, 연도 없음', () => {
    const r = _stripYearPick('2025년 매출은 1억원입니다.');
    expect(r.text).toBe('2025년 매출은 1억원입니다.');
    expect(r.years).toEqual([]);
  });

  it('스트리밍 중 잘린 표식도 미리 감춘다 (깜빡임 방지)', () => {
    expect(_stripYearPick('알려드릴까요?\n[연도선').text).toBe('알려드릴까요?');
    expect(_stripYearPick('알려드릴까요?\n[연도선택: 20').text).toBe('알려드릴까요?');
  });

  it('최신순 정렬 + 중복 제거', () => {
    expect(_stripYearPick('x [연도선택: 2023, 2025, 2025, 2024]').years).toEqual([2025, 2024, 2023]);
  });

  it('연도가 아닌 값은 버린다', () => {
    expect(_stripYearPick('x [연도선택: 99, 2025, 3000]').years).toEqual([2025]);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(_stripYearPick('')).toEqual({ text: '', years: [] });
  });
});

describe('_stripYear — 재질문 문장 만들기', () => {
  it('"올해"를 떼어낸다', () => {
    expect(_stripYear('올해 매출 얼마야')).toBe('매출 얼마야');
  });

  it('"작년", "요즘" 등도 떼어낸다', () => {
    expect(_stripYear('작년 부가세 얼마 냈지')).toBe('부가세 얼마 냈지');
    expect(_stripYear('요즘 소득률 어때')).toBe('소득률 어때');
  });

  it('명시된 연도도 떼어낸다 (버튼 연도와 중복 방지)', () => {
    expect(_stripYear('2025년 매출 얼마야')).toBe('매출 얼마야');
  });

  it('시점 표현만 있던 질문은 기본 문구로 떨어진다', () => {
    expect(_stripYear('올해')).toBe('매출 얼마야');
    expect(_stripYear('')).toBe('매출 얼마야');
  });
});
