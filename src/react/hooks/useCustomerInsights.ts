/**
 * Phase #2 (2026-05-07): 거래처 AI 인사이트 hook.
 *
 * 거래처 데이터 (재무 / 메모 / 신고일) 을 분석해서
 * 이상 거래처 / 신고 임박 / 매출 급변 등 자동 감지.
 *
 * 클라이언트 측 로직 (외부 API 호출 X) — 빠르고 비용 0.
 * 향후 Claude API 호출 옵션 추가 가능 (자연어 인사이트).
 */

import { useEffect, useState } from 'react';
import type { FinanceRow } from './useCustomerFinance';

export type InsightSeverity = 'info' | 'warn' | 'danger';
export type InsightCategory =
  | 'revenue_drop'
  | 'revenue_surge'
  | 'vat_anomaly'
  | 'no_recent_data'
  | 'memo_overdue'
  | 'no_filing'
  | 'cost_high';

export interface Insight {
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  description: string;
  /** 관련 period (있으면) */
  period?: string;
  /** action hint */
  action?: string;
}

interface ApiErrorResponse {
  ok: false;
  error: string;
}

function getKey(): string {
  if (typeof window === 'undefined') return '';
  // @ts-expect-error
  return window.KEY || '';
}

async function safeJson<T>(r: Response): Promise<T | ApiErrorResponse> {
  try {
    return (await r.json()) as T | ApiErrorResponse;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ============================================================
 * 인사이트 계산 로직 (순수 함수 — 단위 테스트 가능)
 * ============================================================ */

interface MemoRow {
  id: number;
  due_date: string | null;
  memo_type: string;
  content: string;
}

export function computeInsights(input: {
  finance: FinanceRow[];
  memos: MemoRow[];
  /** 오늘 날짜 (KST) — 테스트 용 inject. default Date.now() */
  nowMs?: number;
}): Insight[] {
  const insights: Insight[] = [];
  const now = input.nowMs ?? Date.now();

  /* === 재무 분석 === */
  const sortedFinance = input.finance
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period));

  /* 1. 매출 급감 — 최근 분기 vs 이전 분기 -30%+ */
  if (sortedFinance.length >= 2) {
    const last = sortedFinance[sortedFinance.length - 1];
    const prev = sortedFinance[sortedFinance.length - 2];
    const lastRev = Number(last.revenue || 0);
    const prevRev = Number(prev.revenue || 0);
    if (prevRev > 0 && lastRev > 0) {
      const change = (lastRev - prevRev) / prevRev;
      if (change <= -0.3) {
        insights.push({
          category: 'revenue_drop',
          severity: 'danger',
          title: '🔻 매출 급감',
          description: `${prev.period} → ${last.period} 매출 ${Math.round(change * 100)}% 감소`,
          period: last.period,
          action: '거래처에 사정 확인',
        });
      } else if (change >= 0.5) {
        insights.push({
          category: 'revenue_surge',
          severity: 'info',
          title: '📈 매출 급증',
          description: `${prev.period} → ${last.period} 매출 +${Math.round(change * 100)}%`,
          period: last.period,
          action: '예정세 / 부가세 증가 대비',
        });
      }
    }
  }

  /* 2. 부가세 이상 — vat_payable / revenue 비율 비정상 */
  for (const row of sortedFinance) {
    const rev = Number(row.revenue || 0);
    const vat = Number(row.vat_payable || 0);
    if (rev > 0 && vat > 0) {
      const ratio = vat / rev;
      if (ratio > 0.15) {
        insights.push({
          category: 'vat_anomaly',
          severity: 'warn',
          title: '⚠️ 부가세 비율 높음',
          description: `${row.period}: 부가세/매출 ${(ratio * 100).toFixed(1)}% (정상 5-10%)`,
          period: row.period,
          action: '매입세액 누락 확인',
        });
      }
    }
  }

  /* 3. 최근 6개월 데이터 없음 */
  if (sortedFinance.length === 0) {
    insights.push({
      category: 'no_recent_data',
      severity: 'warn',
      title: '📭 재무 데이터 없음',
      description: '아직 한 번도 등록된 재무 데이터가 없음',
      action: 'PDF 업로드 또는 수동 입력',
    });
  } else {
    const last = sortedFinance[sortedFinance.length - 1];
    /* period 가 'YYYY-Q' 또는 'YYYY' — 간단 검증: 최근 1년 안에 있는지 */
    const m = last.period.match(/^(\d{4})/);
    if (m) {
      const lastYear = Number(m[1]);
      const currentYear = new Date(now).getFullYear();
      if (currentYear - lastYear >= 2) {
        insights.push({
          category: 'no_recent_data',
          severity: 'warn',
          title: '📭 최근 데이터 없음',
          description: `최근 등록: ${last.period} (${currentYear - lastYear}년 전)`,
          action: '최신 데이터 업로드',
        });
      }
    }
  }

  /* 4. 매입 비율 너무 높음 — cost / revenue > 90% */
  for (const row of sortedFinance) {
    const rev = Number(row.revenue || 0);
    const cost = Number(row.cost || 0);
    if (rev > 0 && cost > 0) {
      const ratio = cost / rev;
      if (ratio > 0.9) {
        insights.push({
          category: 'cost_high',
          severity: 'warn',
          title: '⚠️ 매입 비율 높음',
          description: `${row.period}: 매입 ${(ratio * 100).toFixed(0)}% (영업이익 거의 0)`,
          period: row.period,
        });
      }
    }
  }

  /* === 메모 분석 === */
  const todayKst = new Date(now + 9 * 60 * 60 * 1000);
  const today = todayKst.toISOString().substring(0, 10);

  /* 5. 오버듀 메모 (due_date 지났는데 미완료) */
  const overdueMemos = input.memos.filter((m) => {
    if (!m.due_date) return false;
    if (m.memo_type === '완료' || m.memo_type === '완료처리') return false;
    return m.due_date < today;
  });
  if (overdueMemos.length > 0) {
    insights.push({
      category: 'memo_overdue',
      severity: 'danger',
      title: '🚨 미완료 메모 (지난 기한)',
      description: `${overdueMemos.length}건 — 가장 오래된: ${overdueMemos[0].due_date}`,
      action: '거래처 dashboard 메모 영역에서 처리',
    });
  }

  return insights;
}

/* ============================================================
 * Hook — fetch + computeInsights 통합
 * ============================================================ */

export interface UseCustomerInsightsState {
  insights: Insight[];
  loading: boolean;
  error: string | null;
}

export function useCustomerInsights(userId: number | null): UseCustomerInsightsState {
  const [state, setState] = useState<UseCustomerInsightsState>({
    insights: [],
    loading: !!userId,
    error: null,
  });

  useEffect(() => {
    if (!userId) {
      setState({ insights: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    const key = getKey();
    if (!key) {
      setState({ insights: [], loading: false, error: 'no admin key' });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([
      fetch(`/api/admin-finance?key=${encodeURIComponent(key)}&user_id=${userId}`).then((r) =>
        safeJson<{ rows?: FinanceRow[] }>(r),
      ),
      fetch(
        `/api/memos?key=${encodeURIComponent(key)}&scope=customer_all&user_id=${userId}`,
      ).then((r) => safeJson<{ memos?: MemoRow[] }>(r)),
    ])
      .then(([financeR, memosR]) => {
        if (cancelled) return;
        const finance = ('ok' in financeR && !financeR.ok) ? [] : (financeR as { rows?: FinanceRow[] }).rows || [];
        const memos = ('ok' in memosR && !memosR.ok) ? [] : (memosR as { memos?: MemoRow[] }).memos || [];
        const insights = computeInsights({ finance, memos });
        setState({ insights, loading: false, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ insights: [], loading: false, error: (e as Error).message });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
