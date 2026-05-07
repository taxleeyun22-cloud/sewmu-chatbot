/**
 * computeInsights 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import { computeInsights } from './useCustomerInsights';
import type { FinanceRow } from './useCustomerFinance';

function fin(p: string, rev: number, cost = 0, vat = 0): FinanceRow {
  return {
    id: 1,
    user_id: 64,
    period: p,
    period_type: 'quarter',
    revenue: rev,
    cost,
    vat_payable: vat,
    income_tax: null,
    taxable_income: null,
    payroll_total: null,
    source: null,
    source_file: null,
  };
}

const TODAY_MS = Date.UTC(2026, 4, 7, 3, 0, 0);  /* 2026-05-07 KST */

describe('computeInsights — 매출 분석', () => {
  it('매출 -30% 이상 → revenue_drop danger', () => {
    const r = computeInsights({
      finance: [fin('2026-1Q', 10000), fin('2026-2Q', 6000)],
      memos: [],
      nowMs: TODAY_MS,
    });
    const drop = r.find((i) => i.category === 'revenue_drop');
    expect(drop).toBeDefined();
    expect(drop!.severity).toBe('danger');
  });

  it('매출 +50% 이상 → revenue_surge info', () => {
    const r = computeInsights({
      finance: [fin('2026-1Q', 10000), fin('2026-2Q', 16000)],
      memos: [],
      nowMs: TODAY_MS,
    });
    const surge = r.find((i) => i.category === 'revenue_surge');
    expect(surge).toBeDefined();
    expect(surge!.severity).toBe('info');
  });

  it('정상 변동 (-20%) → 알림 없음', () => {
    const r = computeInsights({
      finance: [fin('2026-1Q', 10000), fin('2026-2Q', 8500)],
      memos: [],
      nowMs: TODAY_MS,
    });
    expect(r.find((i) => i.category === 'revenue_drop')).toBeUndefined();
  });
});

describe('computeInsights — 부가세 / 매입', () => {
  it('vat/revenue > 15% → vat_anomaly warn', () => {
    const r = computeInsights({
      finance: [fin('2026-1Q', 10000, 0, 1800)],  // 18%
      memos: [],
      nowMs: TODAY_MS,
    });
    const vat = r.find((i) => i.category === 'vat_anomaly');
    expect(vat).toBeDefined();
    expect(vat!.severity).toBe('warn');
  });

  it('cost/revenue > 90% → cost_high warn', () => {
    const r = computeInsights({
      finance: [fin('2026-1Q', 10000, 9500)],  // 95%
      memos: [],
      nowMs: TODAY_MS,
    });
    expect(r.find((i) => i.category === 'cost_high')).toBeDefined();
  });
});

describe('computeInsights — 데이터 없음', () => {
  it('finance 빈 배열 → no_recent_data', () => {
    const r = computeInsights({ finance: [], memos: [], nowMs: TODAY_MS });
    expect(r.find((i) => i.category === 'no_recent_data')).toBeDefined();
  });

  it('2년 전 데이터 → no_recent_data warn', () => {
    const r = computeInsights({
      finance: [fin('2024-1Q', 10000)],
      memos: [],
      nowMs: TODAY_MS,
    });
    expect(r.find((i) => i.category === 'no_recent_data')).toBeDefined();
  });
});

describe('computeInsights — 메모', () => {
  it('overdue 미완료 메모 → memo_overdue danger', () => {
    const r = computeInsights({
      finance: [],
      memos: [
        { id: 1, due_date: '2026-04-01', memo_type: '할 일', content: '부가세 신고' },
        { id: 2, due_date: '2026-05-09', memo_type: '할 일', content: '아직 안 지남' },
        { id: 3, due_date: '2026-04-15', memo_type: '완료', content: '완료된 거 무시' },
      ],
      nowMs: TODAY_MS,
    });
    const overdue = r.find((i) => i.category === 'memo_overdue');
    expect(overdue).toBeDefined();
    expect(overdue!.severity).toBe('danger');
    expect(overdue!.description).toContain('1건');
  });

  it('미완료 메모 0건 → 알림 없음', () => {
    const r = computeInsights({
      finance: [fin('2026-2Q', 10000)],
      memos: [{ id: 1, due_date: '2026-05-10', memo_type: '할 일', content: 'X' }],
      nowMs: TODAY_MS,
    });
    expect(r.find((i) => i.category === 'memo_overdue')).toBeUndefined();
  });
});
