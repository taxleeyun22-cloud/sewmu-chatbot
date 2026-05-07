/**
 * Phase #3 적용 확장 (2026-05-06): admin 액션 wrapper — type-safe.
 *
 * admin.js 의 거대한 cross-script global 함수들을 TypeScript 가 인식하도록
 * admin-globals.d.ts 가 declare. 이 모듈이 그 함수들을 type-safe 호출.
 *
 * 사용:
 *   import { openCustomerDashboardSafe, navigateToRoom } from '@/admin/actions';
 *   await openCustomerDashboardSafe(64);  // 함수 존재 확인 + type-safe
 *
 * 향후 (admin.js 통째 .ts 변환 시):
 *   - 이 wrapper 통해 다른 ES module 이 admin 함수 호출
 *   - admin.js 가 점진 .ts 변환되면서 이 wrapper 가 점점 두꺼워짐
 *   - 최종 admin.ts 변환 시 이 wrapper 가 import 직접 사용
 */

/**
 * 거래처 dashboard 안전 호출 — 함수 존재 확인 후.
 * admin.js 가 로드 안 된 시점 (lazy load 환경) 에서도 안전.
 */
export async function openCustomerDashboardSafe(userId: number): Promise<boolean> {
  if (typeof openCustomerDashboard !== 'function') {
    console.warn('[admin/actions] openCustomerDashboard not loaded yet');
    return false;
  }
  await openCustomerDashboard(userId);
  return true;
}

/**
 * 상담방 진입 안전 호출.
 */
export async function openRoomSafe(roomId: string): Promise<boolean> {
  if (typeof openRoom !== 'function') {
    console.warn('[admin/actions] openRoom not loaded yet');
    return false;
  }
  await openRoom(roomId);
  return true;
}

/**
 * 탭 전환 안전 호출.
 */
export function navigateToTab(
  name: 'chat' | 'live' | 'rooms' | 'users' | 'docs' | 'anal' | 'review' | 'faq' | 'internal',
): boolean {
  if (typeof tab !== 'function') {
    console.warn('[admin/actions] tab() not loaded yet');
    return false;
  }
  tab(name);
  return true;
}

/**
 * 현재 admin 권한 정보 (typed).
 * admin.js 의 IS_OWNER / IS_MANAGER / IS_STAFF 글로벌을 객체로 반환.
 */
export interface AdminRole {
  owner: boolean;
  manager: boolean;
  staff: boolean;
  /** 가장 높은 등급 */
  level: 'owner' | 'manager' | 'staff' | 'unknown';
}

export function getCurrentAdminRole(): AdminRole {
  const owner = typeof IS_OWNER !== 'undefined' && IS_OWNER === true;
  const manager = typeof IS_MANAGER !== 'undefined' && IS_MANAGER === true;
  const staff = typeof IS_STAFF !== 'undefined' && IS_STAFF === true;
  let level: AdminRole['level'] = 'unknown';
  if (owner) level = 'owner';
  else if (manager) level = 'manager';
  else if (staff) level = 'staff';
  return { owner, manager, staff, level };
}

/**
 * 현재 KEY 안전 조회.
 */
export function getCurrentKey(): string {
  if (typeof KEY === 'undefined' || !KEY) return '';
  return KEY;
}

/**
 * 현재 열린 거래처 / 방 정보.
 */
export interface AdminContext {
  userId: number | null;
  roomId: string | null;
  tab: string | null;
}

export function getCurrentAdminContext(): AdminContext {
  return {
    userId: typeof _cdCurrentUserId !== 'undefined' ? _cdCurrentUserId : null,
    roomId: typeof currentRoomId !== 'undefined' ? currentRoomId : null,
    tab:
      typeof location !== 'undefined' && location.hash
        ? (location.hash.match(/^#tab=(\w+)/) || [])[1] || null
        : null,
  };
}
