/**
 * Phase #2 (2026-05-07): React entry — admin.html 안 React 컴포넌트 mount.
 *
 * admin.html 본체는 그대로 (classic script + DOM 조작) 유지.
 * 단지 특정 element ID 를 가진 곳에 React 컴포넌트 mount.
 *
 * 사용 (admin.html 안):
 *   <div id="admin-role-badge"></div>
 *   <script type="module" src="/assets/react.js"></script>
 *
 * → main.tsx 가 #admin-role-badge mount 자동.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { AdminRoleBadge } from './components/AdminRoleBadge';
import { CustomerFinanceChart } from './components/CustomerFinanceChart';
import { CustomerInsightsCard } from './components/CustomerInsightsCard';
/* Phase 2.1 (2026-05-08): 사이드바 휴지통 카운트 React 화 — 첫 점진 phase */
import { SidebarTrashCount } from './components/SidebarTrashCount';
/* Phase 2.2 (2026-05-08): 사용자/업체 총합 카운트 React 화 — 두번째 점진 phase */
import { SidebarUserTotal } from './components/SidebarUserTotal';
import { SidebarBizTotal } from './components/SidebarBizTotal';
/* Phase 2.3 (2026-05-08): 사용자 status 별 카운트 React 화 (탭바 7개) */
import { SidebarStatusCount } from './components/SidebarStatusCount';
/* Phase 2.4 (2026-05-08): 알림 카운트 React 화 (할 일 / 종료 요청 / 에러 로그) */
import { SidebarAlertCount } from './components/SidebarAlertCount';
/* sidebar-store import — window.__sidebarStore 자동 활성화 (admin.js refreshSidebarCounts 가 사용) */
import '../admin/state/sidebar-store';

/**
 * 특정 ID 의 element 안에 React 컴포넌트 mount.
 * element 가 없으면 무시.
 */
function mountAt(elementId: string, render: () => React.ReactNode): boolean {
  const el = document.getElementById(elementId);
  if (!el) return false;
  const root = createRoot(el);
  root.render(<StrictMode>{render()}</StrictMode>);
  return true;
}

/* 사용자별 mount 추적 — re-mount 방지 + 거래처 dashboard 재진입 시 갱신 */
const _mountedRoots = new Map<string, { root: Root; userId?: number }>();

function mountFinanceChart(elementId: string, userId: number): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(elementId);
  if (!el) return;
  const existing = _mountedRoots.get(elementId);
  if (existing) {
    if (existing.userId === userId) return;  /* 같은 user — re-render 불필요 */
    existing.root.unmount();
  }
  const root = createRoot(el);
  root.render(<StrictMode><CustomerFinanceChart userId={userId} /></StrictMode>);
  _mountedRoots.set(elementId, { root, userId });
}

/**
 * 거래처 dashboard 가 user_id 변경 시 호출.
 * admin-customer-dash.js openCustomerDashboard 가 window.__mountFinanceChart(userId).
 */
function mountFinanceChartForUser(userId: number): void {
  mountFinanceChart('cust-finance-chart', userId);
}

/**
 * AI 인사이트 카드 mount — 거래처 dashboard 진입 시.
 */
function mountInsightsForUser(userId: number): void {
  if (typeof document === 'undefined') return;
  const elementId = 'cust-insights-card';
  const el = document.getElementById(elementId);
  if (!el) return;
  const existing = _mountedRoots.get(elementId);
  if (existing) {
    if (existing.userId === userId) return;
    existing.root.unmount();
  }
  const root = createRoot(el);
  root.render(<StrictMode><CustomerInsightsCard userId={userId} /></StrictMode>);
  _mountedRoots.set(elementId, { root, userId });
}

/**
 * DOMContentLoaded 후 자동 mount.
 */
function bootstrap() {
  /* admin role 배지 — admin.html / business.html / 등 어디든 */
  mountAt('admin-role-badge-inline', () => <AdminRoleBadge variant="inline" />);
  mountAt('admin-role-badge-block', () => <AdminRoleBadge variant="block" />);

  /* Phase 2.1 (2026-05-08): 사이드바 휴지통 카운트 — store 자동 reactive */
  mountAt('sb-trash-count-mount', () => <SidebarTrashCount />);
  /* Phase 2.2 (2026-05-08): 사용자/업체 총합 카운트 — store 자동 reactive */
  mountAt('sb-user-total-mount', () => <SidebarUserTotal />);
  mountAt('sb-biz-total-mount', () => <SidebarBizTotal />);

  /* Phase 2.3 (2026-05-08): 사용자 status 별 카운트 (메인 탭바 7개) */
  mountAt('c-pending-mount', () => <SidebarStatusCount status="pending" />);
  mountAt('c-client-mount', () => <SidebarStatusCount status="approvedClient" />);
  mountAt('c-guest-mount', () => <SidebarStatusCount status="approvedGuest" />);
  mountAt('c-rejected-mount', () => <SidebarStatusCount status="rejected" />);
  mountAt('c-terminated-mount', () => <SidebarStatusCount status="terminated" />);
  mountAt('c-rejoined-mount', () => <SidebarStatusCount status="rejoined" />);
  mountAt('c-admin-mount', () => <SidebarStatusCount status="admin" />);

  /* Phase 2.4 (2026-05-08): 알림 카운트 3개 — 할 일 / 종료 요청 / 에러 로그 */
  mountAt('sb-todo-count-mount', () => <SidebarAlertCount variant="urgentTodos" />);
  mountAt('sb-termreq-count-mount', () => <SidebarAlertCount variant="termReq" />);
  mountAt('sb-errorlog-count-mount', () => <SidebarAlertCount variant="errorLog" redWhenNonZero />);

  /* 거래처 dashboard 매출 차트 — data-user-id 속성 있으면 자동 mount.
   * 없으면 admin-customer-dash.js 가 openCustomerDashboard 시 window.__mountFinanceChart(userId) 호출. */
  const chartEl = document.getElementById('cust-finance-chart');
  if (chartEl) {
    const uid = Number(chartEl.dataset.userId || 0);
    if (uid) mountFinanceChartForUser(uid);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

/* 외부 호출 가능하게 노출 — admin.js 가 동적으로 mount 시도 가능 */
declare global {
  interface Window {
    __reactMount?: typeof mountAt;
    __mountFinanceChart?: typeof mountFinanceChartForUser;
    __mountInsights?: typeof mountInsightsForUser;
  }
}
window.__reactMount = mountAt;
window.__mountFinanceChart = mountFinanceChartForUser;
window.__mountInsights = mountInsightsForUser;
