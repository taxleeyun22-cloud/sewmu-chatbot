/**
 * Phase #2 (2026-05-07): 거래처 AI 인사이트 카드.
 *
 * 거래처 dashboard 안 mount — 자동 패턴 감지 + 사장님 액션 추천.
 */

import { type FC } from 'react';
import { useCustomerInsights } from '../hooks/useCustomerInsights';
import type { Insight } from '../hooks/useCustomerInsights';

export interface CustomerInsightsCardProps {
  userId: number;
}

const SEVERITY_COLORS: Record<Insight['severity'], { bg: string; border: string; fg: string }> = {
  info: { bg: '#eff6ff', border: '#3b82f6', fg: '#1e40af' },
  warn: { bg: '#fef3c7', border: '#f59e0b', fg: '#92400e' },
  danger: { bg: '#fee2e2', border: '#dc2626', fg: '#991b1b' },
};

const InsightItem: FC<{ insight: Insight }> = ({ insight }) => {
  const c = SEVERITY_COLORS[insight.severity];
  return (
    <div
      style={{
        background: c.bg,
        borderLeft: `3px solid ${c.border}`,
        padding: '8px 12px',
        marginBottom: '6px',
        borderRadius: '4px 8px 8px 4px',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '.85em', color: c.fg }}>{insight.title}</div>
      <div style={{ fontSize: '.78em', color: '#374151', marginTop: '2px' }}>
        {insight.description}
      </div>
      {insight.action && (
        <div
          style={{ fontSize: '.72em', color: c.fg, marginTop: '4px', fontStyle: 'italic' }}
          aria-label="추천 액션"
        >
          → {insight.action}
        </div>
      )}
    </div>
  );
};

export const CustomerInsightsCard: FC<CustomerInsightsCardProps> = ({ userId }) => {
  const { insights, loading, error } = useCustomerInsights(userId);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#8b95a1', fontSize: '.85em' }}>
        🤖 AI 분석 중...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '12px', color: '#dc2626', fontSize: '.85em' }}>
        분석 오류: {error}
      </div>
    );
  }

  if (!insights.length) {
    return (
      <div
        style={{
          padding: '16px',
          background: '#e0f5ec',
          borderLeft: '3px solid #10b981',
          borderRadius: '4px 8px 8px 4px',
          fontSize: '.85em',
          color: '#065f46',
          fontWeight: 600,
        }}
      >
        ✅ 이상 패턴 없음 — 정상 거래처
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: '.85em',
          fontWeight: 700,
          color: '#191f28',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        🤖 AI 인사이트
        <span
          style={{
            background: '#3182f6',
            color: '#fff',
            fontSize: '.7em',
            padding: '1px 7px',
            borderRadius: '99px',
          }}
        >
          {insights.length}
        </span>
      </div>
      {insights.map((insight, i) => (
        <InsightItem key={i} insight={insight} />
      ))}
    </div>
  );
};

export default CustomerInsightsCard;
