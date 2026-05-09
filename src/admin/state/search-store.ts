/**
 * Phase 3.13 (2026-05-09): 전역 검색 결과 nanostore.
 *
 * admin-search-bulk.js doSearch 가 fetch 후 store 갱신 →
 * SearchResults React 컴포넌트 자동 reactive.
 *
 * 사장님 효과:
 *   - 검색어 변경 시 즉시 표시 (debounce 300ms 후)
 *   - "검색 중..." 상태 자동 표시
 *   - 결과 그룹별 (사용자/상담방/메시지/메모/업체/문서) 같은 마크업 유지
 */
import { atom } from 'nanostores';

export interface SearchResults {
  users?: unknown[];
  rooms?: unknown[];
  room_messages?: unknown[];
  conversations?: unknown[];
  memos?: unknown[];
  businesses?: unknown[];
  documents?: unknown[];
  [key: string]: unknown;
}

export interface SearchState {
  query: string;
  results: SearchResults;
  loading: boolean;
  error: string | null;
  /** 검색 결과 totalN (캐시) */
  totalN: number;
  /** 마지막 fetch 시각 */
  lastFetchedAt: number | null;
}

export const initialSearchState: SearchState = {
  query: '',
  results: {},
  loading: false,
  error: null,
  totalN: 0,
  lastFetchedAt: null,
};

export const $search = atom<SearchState>({ ...initialSearchState });

export function setSearchLoading(query: string): void {
  $search.set({ ...$search.get(), query, loading: true, error: null });
}

export function setSearchResults(query: string, results: SearchResults): void {
  const totalN =
    (results.users?.length || 0) +
    (results.rooms?.length || 0) +
    (results.room_messages?.length || 0) +
    (results.conversations?.length || 0) +
    (results.memos?.length || 0) +
    (results.businesses?.length || 0) +
    (results.documents?.length || 0);
  $search.set({
    ...$search.get(),
    query,
    results,
    loading: false,
    error: null,
    totalN,
    lastFetchedAt: Date.now(),
  });
}

export function setSearchError(msg: string): void {
  $search.set({ ...$search.get(), loading: false, error: msg });
}

export function resetSearch(): void {
  $search.set({ ...initialSearchState });
}

export function getSearch(): SearchState {
  return $search.get();
}

export function subscribeSearch(cb: (s: SearchState) => void): () => void {
  return $search.subscribe(cb);
}

/* ============================================================
 * Global 노출 — admin-search-bulk.js (classic script) 호출용
 * ============================================================ */
export interface SearchStoreGlobal {
  setLoading: (query: string) => void;
  setResults: (query: string, results: SearchResults) => void;
  setError: (msg: string) => void;
  reset: () => void;
  get: () => SearchState;
  subscribe: (cb: (s: SearchState) => void) => () => void;
}

declare global {
  interface Window {
    __searchStore?: SearchStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__searchStore = {
    setLoading: setSearchLoading,
    setResults: setSearchResults,
    setError: setSearchError,
    reset: resetSearch,
    get: getSearch,
    subscribe: subscribeSearch,
  };
}
