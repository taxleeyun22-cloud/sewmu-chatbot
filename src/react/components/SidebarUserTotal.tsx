/**
 * Phase 2.2 (2026-05-08): 사이드바 사용자 총합 React 화.
 * Phase 2.1 (휴지통) 와 동일 패턴 — store 자동 reactive.
 */
import { useStore } from '@nanostores/react';
import { $sidebarCounts } from '../../admin/state/sidebar-store';

export function SidebarUserTotal() {
  const counts = useStore($sidebarCounts);
  return <>{counts.userTotal}</>;
}
