/**
 * Phase 3.6 (2026-05-08): business.html 의 "연결된 상담방" list 용 nanostore.
 *
 * business.js fetch (/api/admin-businesses?id=X) → rooms 배열 set →
 * BizRoomList 컴포넌트가 자동 reactive.
 *
 * 사장님 효과:
 *   - admin 에서 상담방 변경 시 (이름·status 등) business.html 도 즉시 반영
 *   - business.html 자체 mutation (room 추가·해제 등) 후 새로고침 X
 */
import { atom } from 'nanostores';

/** business.html 안 표시되는 상담방 row */
export interface BizRoom {
  id: string;
  name?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface BizRoomsState {
  /** 현재 보고 있는 business id (null = 빈 상태) */
  businessId: number | null;
  /** 상담방 list */
  rooms: BizRoom[];
  /** loading */
  loading: boolean;
  /** error */
  error: string | null;
  /** 마지막 fetch 시각 */
  lastFetchedAt: number | null;
}

export const initialBizRoomsState: BizRoomsState = {
  businessId: null,
  rooms: [],
  loading: false,
  error: null,
  lastFetchedAt: null,
};

export const $bizRooms = atom<BizRoomsState>({ ...initialBizRoomsState });

export function setBizRoomsLoading(businessId: number): void {
  $bizRooms.set({ ...$bizRooms.get(), businessId, loading: true, error: null });
}

export function setBizRoomsList(businessId: number, rooms: BizRoom[]): void {
  $bizRooms.set({
    ...$bizRooms.get(),
    businessId,
    rooms,
    loading: false,
    error: null,
    lastFetchedAt: Date.now(),
  });
}

export function setBizRoomsError(msg: string): void {
  $bizRooms.set({ ...$bizRooms.get(), loading: false, error: msg });
}

export function resetBizRooms(): void {
  $bizRooms.set({ ...initialBizRoomsState });
}

export function getBizRooms(): BizRoomsState {
  return $bizRooms.get();
}

export function subscribeBizRooms(cb: (s: BizRoomsState) => void): () => void {
  return $bizRooms.subscribe(cb);
}

/* ============================================================
 * Global 노출 — business.js (classic script) 호출용
 * ============================================================ */
export interface BizRoomsStoreGlobal {
  setLoading: (businessId: number) => void;
  setList: (businessId: number, rooms: BizRoom[]) => void;
  setError: (msg: string) => void;
  reset: () => void;
  get: () => BizRoomsState;
  subscribe: (cb: (s: BizRoomsState) => void) => () => void;
}

declare global {
  interface Window {
    __bizRoomsStore?: BizRoomsStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__bizRoomsStore = {
    setLoading: setBizRoomsLoading,
    setList: setBizRoomsList,
    setError: setBizRoomsError,
    reset: resetBizRooms,
    get: getBizRooms,
    subscribe: subscribeBizRooms,
  };
}
