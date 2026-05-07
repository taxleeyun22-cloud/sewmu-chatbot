/**
 * Phase #2 (2026-05-07): 거래처 재무 데이터 fetch hook.
 *
 * /api/admin-finance?user_id=N → client_finance 테이블 row 조회.
 * Recharts 차트 컴포넌트 의 source.
 */

import { useEffect, useState } from 'react';

export interface FinanceRow {
  id: number;
  user_id: number;
  period: string;
  period_type: 'quarter' | 'half' | 'year';
  revenue: number | null;
  cost: number | null;
  vat_payable: number | null;
  income_tax: number | null;
  taxable_income: number | null;
  payroll_total: number | null;
  source: 'pdf' | 'manual' | null;
  source_file: string | null;
}

export interface UseCustomerFinanceState {
  rows: FinanceRow[];
  loading: boolean;
  error: string | null;
}

function getKey(): string {
  if (typeof window === 'undefined') return '';
  // @ts-expect-error
  return window.KEY || '';
}

export function useCustomerFinance(userId: number | null): UseCustomerFinanceState {
  const [state, setState] = useState<UseCustomerFinanceState>({
    rows: [],
    loading: !!userId,
    error: null,
  });

  useEffect(() => {
    if (!userId) {
      setState({ rows: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    const key = getKey();
    if (!key) {
      setState({ rows: [], loading: false, error: 'no admin key' });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`/api/admin-finance?key=${encodeURIComponent(key)}&user_id=${userId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as { rows?: FinanceRow[]; error?: string };
        if (cancelled) return;
        if (d.error) throw new Error(d.error);
        setState({ rows: d.rows || [], loading: false, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ rows: [], loading: false, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
