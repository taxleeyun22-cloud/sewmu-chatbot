/**
 * Phase #3 Phase 3-2 (2026-05-06): admin 인증·세션 helper .ts.
 *
 * admin.js 의 doLogin / logout / _refreshAdminRole 의 type-safe 버전.
 *
 * 사용:
 *   import { fetchAdminWhoami, isOwnerSession, getStoredKey } from '@/admin/auth';
 *   const role = await fetchAdminWhoami();
 *   if (role.ok && role.owner) { /* owner 작업 */ /* }
 */

export interface WhoamiResponse {
  ok: true;
  role: 'owner' | 'manager' | 'staff';
  owner: boolean;
  manager: boolean;
  userId: number | null;
}

export interface WhoamiUnauthorized {
  ok: false;
  role: null;
  owner: false;
  manager: false;
  userId: null;
}

/**
 * /api/admin-whoami 호출 — 현재 admin 의 role 조회.
 */
export async function fetchAdminWhoami(
  key?: string,
): Promise<WhoamiResponse | WhoamiUnauthorized> {
  const k = key !== undefined ? key : typeof KEY !== 'undefined' ? KEY : '';
  const url = '/api/admin-whoami' + (k ? '?key=' + encodeURIComponent(k) : '');
  try {
    const r = await fetch(url);
    const d = (await r.json()) as WhoamiResponse | WhoamiUnauthorized;
    return d;
  } catch {
    return { ok: false, role: null, owner: false, manager: false, userId: null };
  }
}

/**
 * sessionStorage 에서 ADMIN_KEY 조회. 없으면 빈 문자열.
 * (보안: localStorage 영구 저장 X — admin.js 패턴 통일)
 */
export function getStoredKey(): string {
  try {
    return sessionStorage.getItem('admin_key') || '';
  } catch {
    return '';
  }
}

/**
 * sessionStorage 에 ADMIN_KEY 저장 + localStorage 잔재 정리.
 */
export function setStoredKey(key: string): void {
  try {
    sessionStorage.setItem('admin_key', key);
  } catch {
    /* sessionStorage 비활성 환경 */
  }
  try {
    localStorage.removeItem('admin_key');
  } catch {
    /* noop */
  }
}

/**
 * 로그아웃 — sessionStorage / localStorage 모두 정리.
 */
export function clearStoredKey(): void {
  try {
    sessionStorage.removeItem('admin_key');
  } catch {
    /* noop */
  }
  try {
    localStorage.removeItem('admin_key');
  } catch {
    /* noop */
  }
}

/**
 * 현재 세션의 owner 권한 여부 — IS_OWNER 글로벌 + ADMIN_KEY 존재 동시 확인.
 */
export function isOwnerSession(): boolean {
  if (typeof IS_OWNER === 'undefined' || IS_OWNER !== true) return false;
  const k = typeof KEY !== 'undefined' ? KEY : '';
  return !!k;
}

/**
 * 현재 세션의 manager 권한 여부.
 */
export function isManagerSession(): boolean {
  if (typeof IS_MANAGER === 'undefined' || IS_MANAGER !== true) return false;
  const k = typeof KEY !== 'undefined' ? KEY : '';
  return !!k;
}

/**
 * 현재 세션의 staff 이상 권한 여부 (owner / manager / staff).
 */
export function isStaffSession(): boolean {
  if (typeof IS_STAFF === 'undefined' || IS_STAFF !== true) return false;
  const k = typeof KEY !== 'undefined' ? KEY : '';
  return !!k;
}
