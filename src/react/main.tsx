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
import { AdminRoleBadge } from './components/AdminRoleBadge';

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

/**
 * DOMContentLoaded 후 자동 mount.
 */
function bootstrap() {
  /* admin role 배지 — admin.html / business.html / 등 어디든 */
  mountAt('admin-role-badge-inline', () => <AdminRoleBadge variant="inline" />);
  mountAt('admin-role-badge-block', () => <AdminRoleBadge variant="block" />);
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
  }
}
window.__reactMount = mountAt;
