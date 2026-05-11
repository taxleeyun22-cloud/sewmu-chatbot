/**
 * Phase 3.14 (2026-05-09): 신고 검토표 list (cdFilingsReview / bdFilingsReview) nanostore.
 *
 * admin-filing-review.js _filRenderListInto / _filReloadList 가 fetch 후 store 갱신 →
 * FilingReviewList React 컴포넌트 자동 reactive.
 *
 * 사장님 효과:
 *   - 신고 Case 생성/저장/상태변경 후 dashboard 즉시 갱신
 *   - 새로고침 X
 */
import { atom } from 'nanostores';

export type FilingOwnerType = 'Person' | 'Business';

export interface FilingReviewItem {
  id: number;
  fiscal_year?: number | string;
  type?: string;
  review_status?: string;
  auto_fields?: string; /* JSON string */
  [key: string]: unknown;
}

export interface FilingReviewState {
  ownerType: FilingOwnerType | null;
  ownerId: number | null;
  ownerName: string;
  filings: FilingReviewItem[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}

export const initialFilingReviewState: FilingReviewState = {
  ownerType: null,
  ownerId: null,
  ownerName: '',
  filings: [],
  loading: false,
  error: null,
  lastFetchedAt: null,
};

export const $filingReview = atom<FilingReviewState>({ ...initialFilingReviewState });

export function setFilingReviewLoading(
  ownerType: FilingOwnerType,
  ownerId: number,
  ownerName?: string,
): void {
  $filingReview.set({
    ...$filingReview.get(),
    ownerType,
    ownerId,
    ownerName: ownerName || '',
    loading: true,
    error: null,
  });
}

export function setFilingReviewList(
  ownerType: FilingOwnerType,
  ownerId: number,
  filings: FilingReviewItem[],
  ownerName?: string,
): void {
  $filingReview.set({
    ...$filingReview.get(),
    ownerType,
    ownerId,
    ownerName: ownerName !== undefined ? ownerName : $filingReview.get().ownerName,
    filings,
    loading: false,
    error: null,
    lastFetchedAt: Date.now(),
  });
}

export function setFilingReviewError(msg: string): void {
  $filingReview.set({ ...$filingReview.get(), loading: false, error: msg });
}

export function resetFilingReview(): void {
  $filingReview.set({ ...initialFilingReviewState });
}

export function getFilingReview(): FilingReviewState {
  return $filingReview.get();
}

export function subscribeFilingReview(cb: (s: FilingReviewState) => void): () => void {
  return $filingReview.subscribe(cb);
}

/* ============================================================
 * Global 노출 — admin-filing-review.js (classic script) 호출용
 * ============================================================ */
export interface FilingReviewStoreGlobal {
  setLoading: (ownerType: FilingOwnerType, ownerId: number, ownerName?: string) => void;
  setList: (
    ownerType: FilingOwnerType,
    ownerId: number,
    filings: FilingReviewItem[],
    ownerName?: string,
  ) => void;
  setError: (msg: string) => void;
  reset: () => void;
  get: () => FilingReviewState;
  subscribe: (cb: (s: FilingReviewState) => void) => () => void;
}

declare global {
  interface Window {
    __filingReviewStore?: FilingReviewStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__filingReviewStore = {
    setLoading: setFilingReviewLoading,
    setList: setFilingReviewList,
    setError: setFilingReviewError,
    reset: resetFilingReview,
    get: getFilingReview,
    subscribe: subscribeFilingReview,
  };
}
