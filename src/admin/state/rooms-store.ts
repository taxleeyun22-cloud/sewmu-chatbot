/**
 * Phase 3.5.A (2026-05-08): 상담방 list nanostore. UI 변화 0 — 인프라만.
 *
 * admin-rooms-list.js loadRoomList 가 fetch 후 store 갱신.
 * 향후 Phase 3.5.B 에서 RoomList React 컴포넌트가 자동 reactive.
 */
import { atom, computed } from 'nanostores';

/** 상담방 row (admin-rooms 응답) */
export interface AdminRoom {
  id: string;
  name?: string | null;
  status?: string | null;
  priority?: number | null;
  business_id?: number | null;
  business_name?: string | null;
  ai_mode?: 'on' | 'off' | null;
  is_internal?: number | boolean | null;
  /** 멤버 미리보기 (서버 응답 안에 포함) */
  first_member_name?: string | null;
  first_member_profile?: string | null;
  /** 마지막 메시지 정보 */
  last_msg_at?: string | null;
  last_msg_preview?: string | null;
  last_msg_content?: string | null;
  last_msg_role?: string | null;
  /** 미읽음 카운트 */
  admin_unread_count?: number | null;
  non_advisor_msg_count?: number | null;
  user_msg_count?: number | null;
  /** 그 외 admin-rooms 응답이 추가하는 필드 */
  [key: string]: unknown;
}

/** 라벨 (담당자 priority) */
export interface RoomLabel {
  id: number;
  name: string;
  color?: string | null;
  [key: string]: unknown;
}

export interface RoomsState {
  /** 모드: 'normal' (일반 상담방) / 'internal' (관리자방) */
  mode: 'normal' | 'internal';
  /** 전체 상담방 list (filter 전) */
  rooms: AdminRoom[];
  /** 라벨 */
  labels: RoomLabel[];
  /** 검색 query */
  searchQuery: string;
  /** 필터 set (라벨 ID 또는 'none' / 'closed') — 표시할 그룹 */
  filterSet: Array<number | 'none' | 'closed'>;
  /** 현재 선택된 방 ID */
  currentRoomId: string | null;
  /** loading */
  loading: boolean;
  /** error */
  error: string | null;
  /** 마지막 fetch 시각 */
  lastFetchedAt: number | null;
}

export const initialRoomsState: RoomsState = {
  mode: 'normal',
  rooms: [],
  labels: [],
  searchQuery: '',
  filterSet: [1, 2, 3, 'none'],
  currentRoomId: null,
  loading: false,
  error: null,
  lastFetchedAt: null,
};

export const $rooms = atom<RoomsState>({ ...initialRoomsState });

/** Partial update */
export function updateRooms(partial: Partial<RoomsState>): void {
  $rooms.set({ ...$rooms.get(), ...partial });
}

/** loading 시작 */
export function setRoomsLoading(): void {
  $rooms.set({ ...$rooms.get(), loading: true, error: null });
}

/** list + labels set */
export function setRoomsList(rooms: AdminRoom[], labels?: RoomLabel[]): void {
  $rooms.set({
    ...$rooms.get(),
    rooms,
    labels: labels || $rooms.get().labels,
    loading: false,
    error: null,
    lastFetchedAt: Date.now(),
  });
}

/** error */
export function setRoomsError(msg: string): void {
  $rooms.set({ ...$rooms.get(), loading: false, error: msg });
}

/** 모드 변경 (normal / internal) */
export function setRoomsMode(mode: 'normal' | 'internal'): void {
  $rooms.set({ ...$rooms.get(), mode });
}

/** 검색어 변경 */
export function setRoomsSearch(q: string): void {
  $rooms.set({ ...$rooms.get(), searchQuery: q });
}

/** 필터 set 변경 (라벨 ID 또는 'none' / 'closed') */
export function setRoomsFilterSet(filterSet: Array<number | 'none' | 'closed'>): void {
  $rooms.set({ ...$rooms.get(), filterSet });
}

/** 현재 방 선택 */
export function setCurrentRoomId(roomId: string | null): void {
  $rooms.set({ ...$rooms.get(), currentRoomId: roomId });
}

/** 특정 방 부분 update (mutation 후) */
export function updateRoomInList(roomId: string, patch: Partial<AdminRoom>): void {
  const cur = $rooms.get();
  $rooms.set({
    ...cur,
    rooms: cur.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
  });
}

/** 특정 방 제거 */
export function removeRoomFromList(roomId: string): void {
  const cur = $rooms.get();
  $rooms.set({ ...cur, rooms: cur.rooms.filter((r) => r.id !== roomId) });
}

/** Total reset */
export function resetRooms(): void {
  $rooms.set({ ...initialRoomsState });
}

/** snapshot */
export function getRooms(): RoomsState {
  return $rooms.get();
}

/** subscribe */
export function subscribeRooms(cb: (s: RoomsState) => void): () => void {
  return $rooms.subscribe(cb);
}

/* Computed — 검색 필터 적용된 list (filterSet 은 그룹화에 사용 — 별도) */
export const $filteredRooms = computed($rooms, (s) => {
  const q = (s.searchQuery || '').trim().toLowerCase();
  if (!q) return s.rooms;
  return s.rooms.filter((rm) => {
    const hay = (
      (rm.name || '') +
      ' ' +
      (rm.business_name || '') +
      ' ' +
      (rm.first_member_name || '') +
      ' ' +
      (rm.last_msg_preview || '') +
      ' ' +
      (rm.last_msg_content || '')
    ).toLowerCase();
    return hay.indexOf(q) >= 0;
  });
});

/* Computed — 안 읽음 총합 */
export const $totalUnread = computed($rooms, (s) =>
  s.rooms.reduce((sum, r) => sum + (Number(r.admin_unread_count) || 0), 0),
);

/* ============================================================
 * Global 노출 — admin-rooms-list.js (classic script) 호출용
 * ============================================================ */
export interface RoomsStoreGlobal {
  setLoading: () => void;
  setList: (rooms: AdminRoom[], labels?: RoomLabel[]) => void;
  setError: (msg: string) => void;
  setMode: (mode: 'normal' | 'internal') => void;
  setSearch: (q: string) => void;
  setFilterSet: (set: Array<number | 'none' | 'closed'>) => void;
  setCurrentRoomId: (id: string | null) => void;
  updateRoom: (id: string, patch: Partial<AdminRoom>) => void;
  removeRoom: (id: string) => void;
  reset: () => void;
  get: () => RoomsState;
  subscribe: (cb: (s: RoomsState) => void) => () => void;
}

declare global {
  interface Window {
    __roomsStore?: RoomsStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__roomsStore = {
    setLoading: setRoomsLoading,
    setList: setRoomsList,
    setError: setRoomsError,
    setMode: setRoomsMode,
    setSearch: setRoomsSearch,
    setFilterSet: setRoomsFilterSet,
    setCurrentRoomId,
    updateRoom: updateRoomInList,
    removeRoom: removeRoomFromList,
    reset: resetRooms,
    get: getRooms,
    subscribe: subscribeRooms,
  };
}
