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
