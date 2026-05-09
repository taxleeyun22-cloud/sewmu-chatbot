/**
 * Phase 2.4 (2026-05-08): 사이드바 알림 카운트 React 화.
 * 3개 alert: 할 일 (urgentTodos) / 종료 요청 (termReq — store 컬럼 별도 / 에러 로그 (errorLog)
 *
 * 통합 컴포넌트 — variant prop 으로 어떤 알림인지.
 * 에러 로그는 빨간 배지 (n > 0) 추가 처리.
 */
import { useStore } from '@nanostores/react';
import { $sidebarCounts, type SidebarCountsState } from '../../admin/state/sidebar-store';

export type AlertVariant = 'urgentTodos' | 'errorLog' | 'termReq';

const VARIANT_TO_FIELD: Record<AlertVariant, keyof SidebarCountsState> = {
  urgentTodos: 'urgentTodos',
  errorLog: 'errorLog',
  termReq: 'termReq',
};

export interface SidebarAlertCountProps {
  variant: AlertVariant;
  /** errorLog 의 빨간 배지 자동 — true 면 n > 0 시 빨간 background */
  redWhenNonZero?: boolean;
}

export function SidebarAlertCount({ variant, redWhenNonZero }: SidebarAlertCountProps) {
  const counts = useStore($sidebarCounts);
  const field = VARIANT_TO_FIELD[variant];
  const value = counts[field];
  const num = typeof value === 'number' ? value : 0;
  if (redWhenNonZero && num > 0) {
    /* 빨간 배지 — admin.css .cnt 스타일 override */
    return <span style={{ background: '#dc2626', color: '#fff', padding: '0 6px', borderRadius: '999px' }}>{num}</span>;
  }
  return <>{num}</>;
}
