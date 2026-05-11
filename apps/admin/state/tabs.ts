/**
 * Phase #3 Phase 2-3 (2026-05-06): admin tab 전환 helper .ts.
 *
 * admin.js 의 tab() 함수 + 사이드바 active state 동기화 로직 type-safe wrapper.
 *
 * admin.js 본체는 그대로 — 이 모듈은 점진 마이그레이션 인프라.
 *
 * 사용 (TypeScript):
 *   import { isValidTab, getTabFromHash, syncSidebarActive } from '@/admin/tabs';
 *   if (isValidTab(name)) navigate(name);
 */

/* admin.html 의 모든 admin 탭 */
export const ADMIN_TABS = [
  'chat',
  'live',
  'rooms',
  'users',
  'docs',
  'anal',
  'review',
  'faq',
  'internal',
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

/**
 * 입력 문자열이 유효한 admin 탭인지 검증.
 */
export function isValidTab(name: string | null | undefined): name is AdminTab {
  if (!name) return false;
  return (ADMIN_TABS as readonly string[]).includes(name);
}

/**
 * URL hash 에서 tab 추출.
 * @example
 *   getTabFromHash('#tab=users')              // 'users'
 *   getTabFromHash('#tab=users&cust=64')      // 'users'
 *   getTabFromHash('#tab=invalid')            // null
 *   getTabFromHash('')                         // null
 */
export function getTabFromHash(hash: string): AdminTab | null {
  if (!hash) return null;
  const m = hash.match(/^#tab=(\w+)/);
  if (!m) return null;
  if (!isValidTab(m[1])) return null;
  return m[1];
}

/**
 * URL hash 에서 cust ID 추출.
 */
export function getCustFromHash(hash: string): number | null {
  if (!hash) return null;
  const m = hash.match(/[#&]cust=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * URL hash 에서 room ID 추출.
 */
export function getRoomFromHash(hash: string): string | null {
  if (!hash) return null;
  const m = hash.match(/[#&]room=([^&]+)/);
  if (!m) return null;
  try {
    const decoded = decodeURIComponent(m[1]);
    return decoded || null;
  } catch {
    return null;
  }
}

/**
 * 새 hash 빌드 — tab + 옵션 cust/room.
 * @example
 *   buildHash({ tab: 'users' })                       // '#tab=users'
 *   buildHash({ tab: 'users', cust: 64 })             // '#tab=users&cust=64'
 *   buildHash({ tab: 'rooms', room: 'Z2HBV2' })       // '#tab=rooms&room=Z2HBV2'
 */
export function buildHash(opts: { tab: AdminTab; cust?: number; room?: string }): string {
  let h = `#tab=${opts.tab}`;
  if (opts.cust) h += `&cust=${opts.cust}`;
  if (opts.room) h += `&room=${encodeURIComponent(opts.room)}`;
  return h;
}

/**
 * 사이드바 .of-sb-item 들의 active state (.on 클래스) 동기화.
 * data-admin-tab 가 매칭되면 .on 추가, 다른 거는 .on 제거.
 *
 * admin.js 의 tab() 안 코드와 동일 동작 — 분리 후 단위 테스트 가능.
 */
export function syncSidebarActive(currentTab: AdminTab): void {
  if (typeof document === 'undefined') return;
  const items = document.querySelectorAll<HTMLElement>('.of-sb-item');
  items.forEach((b) => {
    if (b.dataset.adminTab === currentTab) b.classList.add('on');
    else if (b.dataset.adminTab) b.classList.remove('on');
    /* data-mode='user' 항목은 tab='users' 일 때만 active 후보 */
    if (currentTab !== 'users' && b.dataset.mode === 'user') b.classList.remove('on');
  });
}

/**
 * 마지막 본 tab 을 localStorage 에 저장 / 로드 (사장님 새로고침 시 복원).
 */
export function saveLastTab(tab: AdminTab): void {
  try {
    localStorage.setItem('admin_last_tab', tab);
  } catch {
    /* localStorage 비활성 환경 */
  }
}

export function loadLastTab(): AdminTab | null {
  try {
    const v = localStorage.getItem('admin_last_tab');
    return isValidTab(v) ? v : null;
  } catch {
    return null;
  }
}
