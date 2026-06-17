/**
 * Phase 신고서스크래핑-1 (2026-06-17): _scrape 순수 헬퍼 테스트.
 *
 * normalizeToAutoFields — 제공사 정규화 → filings.auto_fields (chat.js buildFilingContext 키와 호환).
 * backoffMinutes — 재시도 지수 백오프 상한.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { normalizeToAutoFields, backoffMinutes } from './_scrape.js';

describe('normalizeToAutoFields', () => {
  it('maps numeric fields chat.js reads (revenue / decisive_tax)', () => {
    const af = normalizeToAutoFields(
      { revenue: 100000000, decisive_tax: 1200000, paid_tax: 1200000, submitted: true, submitted_at: '2025-05-31' },
      '종소세',
    );
    expect(af.revenue).toBe(100000000);
    expect(af.decisive_tax).toBe(1200000);
    expect(af.paid_tax).toBe(1200000);
    expect(af.submitted).toBe(true);
    expect(af.submitted_at).toBe('2025-05-31');
    /* 수동 검토표와 동일한 기본 구조 보존 */
    expect(af.공제감면).toEqual([]);
    expect(af.가산세).toEqual([]);
  });

  it('includes vat detail only for 부가세', () => {
    const vat = { 매출세액: 10000000, 매입세액: 6000000, 납부세액: 4000000 };
    expect(normalizeToAutoFields({ revenue: 1, vat }, '부가세').vat).toEqual(vat);
    expect(normalizeToAutoFields({ revenue: 1, vat }, '종소세').vat).toBeUndefined();
    expect(normalizeToAutoFields({ revenue: 1, vat }, '법인세').vat).toBeUndefined();
  });

  it('drops non-numeric / null values rather than storing NaN', () => {
    const af = normalizeToAutoFields({ revenue: 'abc', decisive_tax: null }, '종소세');
    expect(af.revenue).toBeUndefined();
    expect(af.decisive_tax).toBeUndefined();
  });

  it('handles null normalized safely', () => {
    const af = normalizeToAutoFields(null, '법인세');
    expect(af.공제감면).toEqual([]);
    expect(af.revenue).toBeUndefined();
  });
});

describe('backoffMinutes', () => {
  it('grows exponentially', () => {
    expect(backoffMinutes(1)).toBe(2);
    expect(backoffMinutes(2)).toBe(4);
    expect(backoffMinutes(3)).toBe(8);
  });
  it('caps at 60 minutes', () => {
    expect(backoffMinutes(10)).toBe(60);
  });
});
