/**
 * Phase 3.1.A (2026-05-08 — Phase 3 첫 점진 phase, 메인 list 영역):
 * 사용자 list nanostore. UI 변화 0 — 인프라만.
 *
 * 흐름:
 *   1. admin-users-tab.js loadUsers(status) 가 fetch 후 → store 갱신 + 기존 innerHTML 조작 둘 다 (병존)
 *   2. nanostore 가 변경 통지 → 향후 UserList React 컴포넌트가 자동 reactive
 *   3. 현재 (Phase 3.1.A): React 컴포넌트 X — store 만 채워둠. 사장님 화면 영향 0.
 *   4. 향후 (Phase 3.1.B): admin.html 의 #userList element → React UserList 로 점진 교체
 */
import { atom, computed } from 'nanostores';
import type { ApprovalCounts } from '../sidebar-counts';

/** users 테이블 row 의 admin-approve 응답 형식 */
export interface AdminUser {
  id: number;
  provider?: string | null;
  provider_id?: string | null;
  name?: string | null;
  real_name?: string | null;
  email?: string | null;
  phone?: string | null;
  profile_image?: string | null;
  approval_status?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
  name_confirmed?: number | null;
  is_admin?: number | null;
  birth_date?: string | null;
  import_batch_id?: number | null;
  /* 화면 표시용 추가 컬럼 */
  company_name?: string | null;
  ceo_name?: string | null;
  active_merge_id?: number | null;
  is_likely_merged?: number | null;
  /* 그 외 admin-approve 응답이 추가하는 필드들 */
  [key: string]: unknown;
}

export interface UsersState {
  /** 현재 활성 status 필터 (사장님이 클릭한 탭) */
  currentStatus: string;
  /** 현재 status 의 user list */
  users: AdminUser[];
  /** admin-approve 응답의 counts (Phase 2.3 의 SidebarStatusCount 와 별도 — 여기는 store 자체 보관용) */
  counts: Partial<ApprovalCounts>;
  /** 마지막 fetch 시각 (디버깅·캐싱) */
  lastFetchedAt: number | null;
  /** loading 상태 */
  loading: boolean;
  /** 에러 (있을 때) */
  error: string | null;
  /** 검색어 (clientSearchInput) — Phase Infra-2 fix (2026-05-09):
   *  React UserList 가 store searchQuery 자동 filter — 카드 display 직접 조작 X */
  searchQuery: string;
}

export const initialUsersState: UsersState = {
  currentStatus: 'pending',
  users: [],
  counts: {},
  lastFetchedAt: null,
  loading: false,
  error: null,
  searchQuery: '',
};

export const $users = atom<UsersState>({ ...initialUsersState });

/** Partial update */
export function updateUsers(partial: Partial<UsersState>): void {
  $users.set({ ...$users.get(), ...partial });
}

/** 현재 status + user list 모두 set */
export function setUsersList(status: string, users: AdminUser[], counts?: Partial<ApprovalCounts>): void {
  $users.set({
    ...$users.get(),
    currentStatus: status,
    users,
    counts: counts || $users.get().counts,
    lastFetchedAt: Date.now(),
    loading: false,
    error: null,
  });
}

/** loading 시작 */
export function setUsersLoading(status?: string): void {
  $users.set({
    ...$users.get(),
    currentStatus: status || $users.get().currentStatus,
    loading: true,
    error: null,
  });
}

/** 에러 */
export function setUsersError(msg: string): void {
  $users.set({
    ...$users.get(),
    loading: false,
    error: msg,
  });
}

/** mutation 후 list 안 특정 user 제거 (예: 거절/승급으로 다른 카테고리 이동) */
export function removeUserFromList(userId: number): void {
  const cur = $users.get();
  $users.set({
    ...cur,
    users: cur.users.filter((u) => u.id !== userId),
  });
}

/** mutation 후 list 안 특정 user 부분 update */
export function updateUserInList(userId: number, patch: Partial<AdminUser>): void {
  const cur = $users.get();
  $users.set({
    ...cur,
    users: cur.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
  });
}

/** 검색어 set (Phase Infra-2 fix) — admin-search-bulk.js _doClientSearch 가 호출 */
export function setUsersSearchQuery(q: string): void {
  $users.set({ ...$users.get(), searchQuery: q });
}

/** Total reset — logout 시 */
export function resetUsers(): void {
  $users.set({ ...initialUsersState });
}

/** 현재 값 fetch */
export function getUsers(): UsersState {
  return $users.get();
}

/** subscribe */
export function subscribeUsers(cb: (s: UsersState) => void): () => void {
  return $users.subscribe(cb);
}

/* Computed — 현재 status 의 user 수 (UserList footer / 검색 결과 표시 용) */
export const $usersCount = computed($users, (s) => s.users.length);

/* ============================================================
 * Global 노출 — admin-users-tab.js (classic script) 호출용
 * window.__usersStore.setList(status, users, counts) 패턴
 * ============================================================ */
export interface UsersStoreGlobal {
  setList: (status: string, users: AdminUser[], counts?: Partial<ApprovalCounts>) => void;
  setLoading: (status?: string) => void;
  setError: (msg: string) => void;
  removeUser: (userId: number) => void;
  updateUser: (userId: number, patch: Partial<AdminUser>) => void;
  /** Phase Infra-2 (2026-05-09): 검색어 set — React UserList 자동 filter */
  setSearchQuery: (q: string) => void;
  reset: () => void;
  get: () => UsersState;
  subscribe: (cb: (s: UsersState) => void) => () => void;
}

declare global {
  interface Window {
    __usersStore?: UsersStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__usersStore = {
    setList: setUsersList,
    setLoading: setUsersLoading,
    setError: setUsersError,
    removeUser: removeUserFromList,
    updateUser: updateUserInList,
    setSearchQuery: setUsersSearchQuery,
    reset: resetUsers,
    get: getUsers,
    subscribe: subscribeUsers,
  };
}
