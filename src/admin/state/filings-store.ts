/**
 * Phase 3.10 (2026-05-09): 거래처 dashboard 신고 Case (cdFilings) nanostore.
 *
 * admin.js _loadCdFilings 가 fetch 후 store 갱신 → CdFilings React 컴포넌트 자동 reactive.
 *
 * 사장님 효과:
 *   - 신고 항목 체크/추가/삭제 후 그 거래처 dashboard 자동 갱신
 *   - 새 Case 생성 후 즉시 표시
 */
import { atom } from 'nanostores';

export interface FilingItem {
  id: number;
  filing_id?: number;
  item_text?: string;
  is_checked?: boolean | number;
  checked_by?: string | null;
  [key: string]: unknown;
}

export interface FilingCase {
  id: number;
  user_id?: number;
  filing_type?: string;
  period?: string;
  title?: string | null;
  due_date?: string | null;
  status?: string;
  items?: FilingItem[];
  [key: string]: unknown;
}

export interface FilingsState {
  userId: number | null;
  filings: FilingCase[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}

export const initialFilingsState: FilingsState = {
  userId: null,
  filings: [],
  loading: false,
  error: null,
  lastFetchedAt: null,
};

export const $filings = atom<FilingsState>({ ...initialFilingsState });

export function setFilingsLoading(userId: number): void {
  $filings.set({ ...$filings.get(), userId, loading: true, error: null });
}

export function setFilingsList(userId: number, filings: FilingCase[]): void {
  $filings.set({
    ...$filings.get(),
    userId,
    filings,
    loading: false,
    error: null,
    lastFetchedAt: Date.now(),
  });
}

export function setFilingsError(msg: string): void {
  $filings.set({ ...$filings.get(), loading: false, error: msg });
}

export function resetFilings(): void {
  $filings.set({ ...initialFilingsState });
}

export function getFilings(): FilingsState {
  return $filings.get();
}

export function subscribeFilings(cb: (s: FilingsState) => void): () => void {
  return $filings.subscribe(cb);
}

/* ============================================================
 * Global 노출 — admin.js (classic script) 호출용
 * ============================================================ */
export interface FilingsStoreGlobal {
  setLoading: (userId: number) => void;
  setList: (userId: number, filings: FilingCase[]) => void;
  setError: (msg: string) => void;
  reset: () => void;
  get: () => FilingsState;
  subscribe: (cb: (s: FilingsState) => void) => () => void;
}

declare global {
  interface Window {
    __filingsStore?: FilingsStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__filingsStore = {
    setLoading: setFilingsLoading,
    setList: setFilingsList,
    setError: setFilingsError,
    reset: resetFilings,
    get: getFilings,
    subscribe: subscribeFilings,
  };
}
