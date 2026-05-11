/**
 * Phase 2.3 (2026-05-08): 사용자 status 별 카운트 React 화.
 * 메인 탭바 (admin-modals.html usersView 안) — 대기/기장거래처/일반승인/거절/종료/재가입/관리자
 *
 * 통합 컴포넌트 — status prop 받아서 sidebar-store 의 해당 컬럼 자동 reactive 표시.
 */
import { useStore } from '@nanostores/react';
import { $sidebarCounts, type SidebarCountsState } from '@/state/sidebar-store';

/** status 키 → store 컬럼 매핑 */
export type StatusKey =
  | 'pending'
  | 'approvedClient'
  | 'approvedGuest'
  | 'rejected'
  | 'terminated'
  | 'rejoined'
  | 'admin';

const KEY_TO_FIELD: Record<StatusKey, keyof SidebarCountsState> = {
  pending: 'pending',
  approvedClient: 'approvedClient',
  approvedGuest: 'approvedGuest',
  rejected: 'rejected',
  terminated: 'terminated',
  rejoined: 'rejoined',
  admin: 'admin',
};

export interface SidebarStatusCountProps {
  status: StatusKey;
}

export function SidebarStatusCount({ status }: SidebarStatusCountProps) {
  const counts = useStore($sidebarCounts);
  const field = KEY_TO_FIELD[status];
  const value = counts[field];
  /* number 타입 보장 (lastUpdatedAt 같은 nullable 필드 방어) */
  return <>{typeof value === 'number' ? value : 0}</>;
}
