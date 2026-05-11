/**
 * Phase 2.2 (2026-05-08): 사이드바 업체 총합 React 화.
 */
import { useStore } from '@nanostores/react';
import { $sidebarCounts } from '@/state/sidebar-store';

export function SidebarBizTotal() {
  const counts = useStore($sidebarCounts);
  return <>{counts.bizTotal}</>;
}
