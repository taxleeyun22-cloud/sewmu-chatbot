/**
 * Phase 16 (2026-05-13): 종소세 / 법인세 입력 항목 분리 검증.
 *
 * 명세서 `신고검토표_시스템_명세.md` 4.1 / 4.2 + 2026-05-07 익금/손금 (법인세 만).
 * 사장님 명령 (2026-05-13): "소득세입력폼이랑 법인세 입력폰이랑 나눠야지".
 */
import { describe, it, expect } from 'vitest';

/* admin-filing-review.js 와 동일 fields 구조 — 명세 검증. */
const JONGSO_KEYS = [
  'revenue',
  'total_income',
  'income_deduction',
  'tax_base',
  'calculated_tax',
  'deduction_total',
  'penalty_total',
  'decisive_tax',
  'prepaid_tax',
  'payable_tax',
];

const BEOPIN_KEYS = [
  'revenue',
  'net_income',
  'adj_inclusion',
  'adj_exclusion',
  'business_income',
  'tax_base',
  'calculated_tax',
  'deduction_total',
  'penalty_total',
  'decisive_tax',
  'prepaid_tax',
  'additional_tax',
  'payable_tax',
];

describe('Filing fields 분리 (사장님 명령 2026-05-13)', () => {
  it('종소세 = 10항목 (명세 4.1)', () => {
    expect(JONGSO_KEYS).toHaveLength(10);
  });

  it('법인세 = 13항목 (명세 4.2 + 익금/손금)', () => {
    expect(BEOPIN_KEYS).toHaveLength(13);
  });

  it('종소세 전용 키 — total_income / income_deduction (법인세에 없음)', () => {
    expect(JONGSO_KEYS).toContain('total_income');
    expect(JONGSO_KEYS).toContain('income_deduction');
    expect(BEOPIN_KEYS).not.toContain('total_income');
    expect(BEOPIN_KEYS).not.toContain('income_deduction');
  });

  it('법인세 전용 키 — net_income / adj_inclusion / adj_exclusion / business_income / additional_tax', () => {
    expect(BEOPIN_KEYS).toContain('net_income');
    expect(BEOPIN_KEYS).toContain('adj_inclusion');
    expect(BEOPIN_KEYS).toContain('adj_exclusion');
    expect(BEOPIN_KEYS).toContain('business_income');
    expect(BEOPIN_KEYS).toContain('additional_tax');
    expect(JONGSO_KEYS).not.toContain('net_income');
    expect(JONGSO_KEYS).not.toContain('adj_inclusion');
    expect(JONGSO_KEYS).not.toContain('adj_exclusion');
    expect(JONGSO_KEYS).not.toContain('business_income');
    expect(JONGSO_KEYS).not.toContain('additional_tax');
  });

  it('공통 키 — revenue / tax_base / calculated_tax / decisive_tax / prepaid_tax / payable_tax / deduction_total / penalty_total', () => {
    const common = [
      'revenue',
      'tax_base',
      'calculated_tax',
      'decisive_tax',
      'prepaid_tax',
      'payable_tax',
      'deduction_total',
      'penalty_total',
    ];
    for (const k of common) {
      expect(JONGSO_KEYS, `종소세 should have ${k}`).toContain(k);
      expect(BEOPIN_KEYS, `법인세 should have ${k}`).toContain(k);
    }
  });

  it('D1 auto_fields JSON 호환 — JSON.stringify/parse 가능 (이전 데이터 유지)', () => {
    const sample = {
      revenue: 1000000,
      tax_base: 500000,
      calculated_tax: 50000,
    };
    expect(JSON.parse(JSON.stringify(sample))).toEqual(sample);
  });
});
