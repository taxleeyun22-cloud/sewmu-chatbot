/**
 * 검토표 JSON 심기 — 기존 값 교체(overwrite) 판정.
 *
 * 2026-09-15 사장님: 기존 검토표에 수입금액이 1억으로 들어가 있는데
 * 신고서 원본은 5.44억. 기본 동작(빈 칸만 보강)으로는 영영 안 고쳐진다.
 * → overwrite 옵션을 켰을 때만 교체하고, 무엇이 무엇으로 바뀌는지 전부 남긴다.
 *
 * 여기서 지키는 것:
 *  1. overwrite 를 안 켜면 기존 값은 절대 안 바뀐다 (기본 안전동작 유지)
 *  2. overwrite 를 켜도 값이 같으면 건드리지 않는다 (불필요한 audit 방지)
 *  3. 교체 내역(before/after)이 빠짐없이 수집된다
 */
import { describe, it, expect } from 'vitest';

/* preview 의 판정 로직과 동일 — 실제 코드와 함께 바뀌어야 하는 계약 */
type Fields = Record<string, unknown>;
function judge(af: Fields, fields: Fields, overwrite: boolean) {
  const isEmpty = (k: string) =>
    af[k] === undefined || af[k] === null || af[k] === '' || (Number(af[k]) === 0 && fields[k] !== 0);
  const differs = (k: string) => JSON.stringify(af[k]) !== JSON.stringify(fields[k]);
  const willFill = Object.keys(fields).filter((k) => isEmpty(k) || (overwrite && differs(k)));
  const overwrites = overwrite
    ? Object.keys(fields).filter((k) => !isEmpty(k) && differs(k)).map((k) => ({ key: k, before: af[k], after: fields[k] }))
    : [];
  return { willFill, overwrites, kept: Object.keys(fields).filter((k) => !willFill.includes(k)) };
}

const 신고서 = { revenue: 544_917_434, total_income: 117_110_935, decisive_tax: 5_699_350 };

describe('기본 동작 — 수기 입력값 보호', () => {
  it('기존 값이 있으면 안 덮는다', () => {
    const r = judge({ revenue: 100_000_000 }, 신고서, false);
    expect(r.willFill).not.toContain('revenue');
    expect(r.kept).toContain('revenue');
    expect(r.overwrites).toEqual([]);
  });

  it('빈 칸은 채운다', () => {
    const r = judge({ revenue: 100_000_000 }, 신고서, false);
    expect(r.willFill).toContain('total_income');
    expect(r.willFill).toContain('decisive_tax');
  });

  it('0 은 빈 칸으로 보고 채운다 (신고서 값이 0 이 아닐 때)', () => {
    expect(judge({ revenue: 0 }, 신고서, false).willFill).toContain('revenue');
  });

  it('신고서 값이 0 이면 기존 0 을 굳이 다시 쓰지 않는다', () => {
    const r = judge({ penalty_total: 0 }, { penalty_total: 0 }, false);
    expect(r.willFill).not.toContain('penalty_total');
  });
});

describe('overwrite 동작 — 신고서 우선', () => {
  it('기존 1억 → 신고서 5.44억 으로 교체된다', () => {
    const r = judge({ revenue: 100_000_000 }, 신고서, true);
    expect(r.willFill).toContain('revenue');
    expect(r.overwrites).toEqual([{ key: 'revenue', before: 100_000_000, after: 544_917_434 }]);
  });

  it('값이 같으면 교체 목록에 안 들어간다', () => {
    const r = judge({ revenue: 544_917_434 }, 신고서, true);
    expect(r.overwrites).toEqual([]);
    expect(r.willFill).not.toContain('revenue');
  });

  it('빈 칸 보강은 교체가 아니다 (경고 대상 아님)', () => {
    const r = judge({}, 신고서, true);
    expect(r.willFill).toHaveLength(3);
    expect(r.overwrites).toEqual([]);
  });

  it('여러 항목이 동시에 다르면 전부 수집된다', () => {
    const r = judge({ revenue: 1, total_income: 2, decisive_tax: 5_699_350 }, 신고서, true);
    expect(r.overwrites.map((o) => o.key)).toEqual(['revenue', 'total_income']);
  });

  it('부가세 vat 객체도 내용이 다르면 교체된다', () => {
    const r = judge(
      { vat: { 매출세액: 1 } },
      { vat: { 매출세액: 12_000_000, 매입세액: 7_200_000 } },
      true,
    );
    expect(r.overwrites).toHaveLength(1);
    expect(r.overwrites[0].key).toBe('vat');
  });

  it('vat 객체 내용이 같으면 교체 안 한다', () => {
    const same = { 매출세액: 12_000_000 };
    expect(judge({ vat: same }, { vat: { ...same } }, true).overwrites).toEqual([]);
  });
});
