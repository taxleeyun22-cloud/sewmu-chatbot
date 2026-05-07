/**
 * Phase #3 Phase 3-3 (2026-05-06): RBAC UI 가드 helper .ts.
 *
 * admin.js 의 _refreshOwnerUI / _refreshErrorLogOwnerUI / IS_MANAGER UI 가드 통합.
 *
 * 사용:
 *   import { applyOwnerOnlyVisibility, applyManagerPlusVisibility } from '@/admin/role-ui';
 *   applyOwnerOnlyVisibility('ownerExportBtn');  // owner 만 보임
 */

import { isOwnerSession, isManagerSession } from './auth';

/**
 * 특정 element 를 owner 만 보이게 / 다른 사용자는 hide.
 *
 * @param elementId DOM element ID
 * @param displayOnShow 표시 시 display 값 ('inline-block', 'flex', 등). default 'inline-block'.
 */
export function applyOwnerOnlyVisibility(
  elementId: string,
  displayOnShow: string = 'inline-block',
): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(elementId);
  if (!el) return;
  el.style.display = isOwnerSession() ? displayOnShow : 'none';
}

/**
 * Manager 이상 (manager + owner) 만 보이게.
 */
export function applyManagerPlusVisibility(
  elementId: string,
  displayOnShow: string = 'inline-block',
): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(elementId);
  if (!el) return;
  const visible = isOwnerSession() || isManagerSession();
  el.style.display = visible ? displayOnShow : 'none';
}

/**
 * 여러 element 를 한 번에 owner-only 처리.
 */
export function applyOwnerOnlyVisibilityAll(elementIds: string[]): void {
  for (const id of elementIds) applyOwnerOnlyVisibility(id);
}

/**
 * 권한 부족 시 disable + 시각적 옅게.
 */
export function applyOwnerOnlyDisable(elementId: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(elementId) as HTMLButtonElement | null;
  if (!el) return;
  if (isOwnerSession()) {
    el.disabled = false;
    el.style.opacity = '';
    el.title = '';
  } else {
    el.disabled = true;
    el.style.opacity = '0.5';
    el.title = 'owner 권한 필요';
  }
}

/**
 * Owner 아니면 confirm + 안내 alert. (admin.js setStaffRole / setAdminFlag 패턴)
 */
export function requireOwnerOrAlert(): boolean {
  if (isOwnerSession()) return true;
  if (typeof alert === 'function') {
    alert('owner 권한이 필요합니다.\n사장님 (ADMIN_KEY 또는 user_id=1) 만 가능.');
  }
  return false;
}

/**
 * Manager 이상 아니면 confirm + 안내 alert.
 */
export function requireManagerPlusOrAlert(): boolean {
  if (isOwnerSession() || isManagerSession()) return true;
  if (typeof alert === 'function') {
    alert('Manager 권한이 필요합니다.\n사장님께 권한 부여 요청하세요.');
  }
  return false;
}
