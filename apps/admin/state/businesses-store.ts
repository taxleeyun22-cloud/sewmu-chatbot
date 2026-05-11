/**
 * Phase 3.2.A (2026-05-08): 업체 list nanostore. UI 변화 0 — 인프라만.
 *
 * 흐름:
 *   1. admin-business-tab.js loadBusinessList 가 fetch 후 → store 갱신 + 기존 _bizListCache + DOM 조작 둘 다 (병존)
 *   2. nanostore 가 변경 통지 → 향후 BusinessList React 컴포넌트가 자동 reactive
 *   3. 현재 (Phase 3.2.A): React 컴포넌트 X — store 만 채워둠. 사장님 화면 영향 0.
 *   4. 향후 (Phase 3.2.B): admin.html 의 #bizList element → React BusinessList 로 점진 교체
 */
import { atom, computed } from 'nanostores';

/** businesses 테이블 row + 추가 컬럼 (admin-businesses 응답) */
export interface AdminBusiness {
  id: number;
  company_name?: string | null;
  business_number?: string | null;
  ceo_name?: string | null;
  business_category?: string | null;
  industry?: string | null;
  industry_code?: string | null;
  tax_type?: string | null;
  address?: string | null;
  phone?: string | null;
  sub_business_number?: string | null;
  corporate_number?: string | null;
  parent_business_id?: number | null;
  company_form?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  member_count?: number | null;
  room_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  import_batch_id?: number | null;
  /* 그 외 admin-businesses 응답이 추가하는 필드 */
  [key: string]: unknown;
}

/** status counts (active / closed / terminated) */
export interface BusinessCounts {
  active?: number;
  closed?: number;
  terminated?: number;
}

export interface BusinessesState {
  /** 현재 활성 status 필터 (active / closed / terminated / 'all') */
  currentStatus: string;
  /** 현재 status 의 business list */
  businesses: AdminBusiness[];
  /** counts */
  counts: BusinessCounts;
  /** 검색 query */
  searchQuery: string;
  /** 마지막 fetch 시각 */
  lastFetchedAt: number | null;
  /** loading */
  loading: boolean;
  /** error */
  error: string | null;
}

export const initialBusinessesState: BusinessesState = {
  currentStatus: 'all',
  businesses: [],
  counts: {},
  searchQuery: '',
  lastFetchedAt: null,
  loading: false,
  error: null,
};

export const $businesses = atom<BusinessesState>({ ...initialBusinessesState });

/** Partial update */
export function updateBusinesses(partial: Partial<BusinessesState>): void {
  $businesses.set({ ...$businesses.get(), ...partial });
}

/** list 와 counts 동시 set */
export function setBusinessesList(
  businesses: AdminBusiness[],
  counts?: BusinessCounts,
): void {
  $businesses.set({
    ...$businesses.get(),
    businesses,
    counts: counts || $businesses.get().counts,
    lastFetchedAt: Date.now(),
    loading: false,
    error: null,
  });
}

/** loading 시작 */
export function setBusinessesLoading(): void {
  $businesses.set({
    ...$businesses.get(),
    loading: true,
    error: null,
  });
}

/** error */
export function setBusinessesError(msg: string): void {
  $businesses.set({
    ...$businesses.get(),
    loading: false,
    error: msg,
  });
}

/** status 필터 변경 */
export function setBusinessesStatus(status: string): void {
  $businesses.set({ ...$businesses.get(), currentStatus: status });
}

/** 검색 query 변경 */
export function setBusinessesSearch(q: string): void {
  $businesses.set({ ...$businesses.get(), searchQuery: q });
}

/** 특정 business 제거 (mutation 후 — 삭제) */
export function removeBusinessFromList(bizId: number): void {
  const cur = $businesses.get();
  $businesses.set({
    ...cur,
    businesses: cur.businesses.filter((b) => b.id !== bizId),
  });
}

/** 특정 business 부분 update */
export function updateBusinessInList(bizId: number, patch: Partial<AdminBusiness>): void {
  const cur = $businesses.get();
  $businesses.set({
    ...cur,
    businesses: cur.businesses.map((b) => (b.id === bizId ? { ...b, ...patch } : b)),
  });
}

/** 특정 business 추가 (mutation 후 — 신규) */
export function addBusinessToList(biz: AdminBusiness): void {
  const cur = $businesses.get();
  /* 중복 ID 방지 */
  if (cur.businesses.some((b) => b.id === biz.id)) return;
  $businesses.set({
    ...cur,
    businesses: [biz, ...cur.businesses],
  });
}

/** Total reset */
export function resetBusinesses(): void {
  $businesses.set({ ...initialBusinessesState });
}

/** snapshot */
export function getBusinesses(): BusinessesState {
  return $businesses.get();
}

/** subscribe */
export function subscribeBusinesses(cb: (s: BusinessesState) => void): () => void {
  return $businesses.subscribe(cb);
}

/* Computed — 현재 status + 검색 후 filtered list */
export const $filteredBusinesses = computed($businesses, (s) => {
  let list = s.businesses;
  if (s.currentStatus && s.currentStatus !== 'all') {
    list = list.filter((b) => (b.status || 'active') === s.currentStatus);
  }
  const q = (s.searchQuery || '').trim().toLowerCase();
  if (q) {
    list = list.filter((b) => {
      const haystack = (
        (b.company_name || '') +
        ' ' +
        (b.business_number || '') +
        ' ' +
        (b.ceo_name || '')
      ).toLowerCase();
      return haystack.indexOf(q) >= 0;
    });
  }
  return list;
});

/* Computed — count by status */
export const $businessesActiveCount = computed($businesses, (s) =>
  s.businesses.filter((b) => (b.status || 'active') === 'active').length,
);
export const $businessesClosedCount = computed($businesses, (s) =>
  s.businesses.filter((b) => b.status === 'closed').length,
);

/* ============================================================
 * Global 노출 — admin-business-tab.js (classic script) 호출용
 * ============================================================ */
export interface BusinessesStoreGlobal {
  setList: (businesses: AdminBusiness[], counts?: BusinessCounts) => void;
  setLoading: () => void;
  setError: (msg: string) => void;
  setStatus: (status: string) => void;
  setSearch: (q: string) => void;
  removeBusiness: (bizId: number) => void;
  updateBusiness: (bizId: number, patch: Partial<AdminBusiness>) => void;
  addBusiness: (biz: AdminBusiness) => void;
  reset: () => void;
  get: () => BusinessesState;
  subscribe: (cb: (s: BusinessesState) => void) => () => void;
}

declare global {
  interface Window {
    __businessesStore?: BusinessesStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__businessesStore = {
    setList: setBusinessesList,
    setLoading: setBusinessesLoading,
    setError: setBusinessesError,
    setStatus: setBusinessesStatus,
    setSearch: setBusinessesSearch,
    removeBusiness: removeBusinessFromList,
    updateBusiness: updateBusinessInList,
    addBusiness: addBusinessToList,
    reset: resetBusinesses,
    get: getBusinesses,
    subscribe: subscribeBusinesses,
  };
}
