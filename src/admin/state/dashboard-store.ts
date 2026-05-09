/**
 * Phase 3.4.A (2026-05-08): 거래처 dashboard nanostore. UI 변화 0 — 인프라만.
 *
 * admin-customer-dash.js openCustomerDashboard 가 fetch 후 store 갱신.
 * 향후 (Phase 3.4.B~) React 컴포넌트가 자동 reactive.
 *
 * 영역:
 *   - cdName / cdSub (헤더)
 *   - cdBasic (기본 정보 그리드)
 *   - cdDocs (문서 카운트)
 *   - cdFinance (재무 요약)
 *   - cdBizDocs (연결된 사업장)
 *   - cdRecentChat (최근 대화)
 *   - cdSummaries (자동 요약)
 *   - cdPriority (우선순위 배지)
 */
import { atom } from 'nanostores';
import type { AdminUser } from './users-store';
import type { AdminBusiness } from './businesses-store';

/** 문서 status 카운트 */
export interface DocCounts {
  pending?: number;
  approved?: number;
  rejected?: number;
}

/** 재무 요약 row */
export interface FinanceRow {
  period?: string;
  revenue?: number | null;
  vat_payable?: number | null;
  income_tax?: number | null;
  [key: string]: unknown;
}

/** 거래처 자동 요약 */
export interface CustomerSummary {
  id: number;
  range?: string;
  summary?: string;
  created_at?: string;
  [key: string]: unknown;
}

/** 최근 대화 (방 별) */
export interface RoomBrief {
  id: string;
  name?: string | null;
  status?: string | null;
  priority?: number | null;
  last_message_at?: string | null;
  last_message?: string | null;
  [key: string]: unknown;
}

export interface DashboardState {
  /** 현재 dashboard 의 user_id (null = 모달 닫힘 또는 로드 전) */
  userId: number | null;
  /** user 정보 (admin-approve fetch 결과) */
  user: AdminUser | null;
  /** 매핑된 사업장 (시스템 B) */
  mappedBusinesses: AdminBusiness[];
  /** legacy 사업장 (시스템 A: client_businesses) */
  legacyBusinesses: unknown[];
  /** 문서 status 카운트 */
  docCounts: DocCounts;
  /** 재무 요약 */
  finance: { has_data: boolean; rows: FinanceRow[] };
  /** 우선순위 (1/2/3 또는 0=미분류) */
  priority: number;
  /** 자동 요약 list */
  summaries: CustomerSummary[];
  /** 최근 대화 방 (active 우선) */
  recentRoom: RoomBrief | null;
  /** loading */
  loading: boolean;
  /** error */
  error: string | null;
  /** 마지막 fetch 시각 */
  lastFetchedAt: number | null;
  /* Phase 3.4.F (2026-05-08): cdTodos / cdSummaries 영역 — admin-customer-dash.js
   * 의 _loadCdTodosAndSummaries / _loadCdAutoSummary 가 markup 만든 후 store 에 set.
   * React 가 자동 reactive 표시 (dangerouslySetInnerHTML).
   * 별도 fetch 결과라 user 정보와 다른 timing 으로 set 됨. */
  todosHtml: string;
  todosCount: number;
  summariesHtml: string;
  summaryCount: number;
}

export const initialDashboardState: DashboardState = {
  userId: null,
  user: null,
  mappedBusinesses: [],
  legacyBusinesses: [],
  docCounts: {},
  finance: { has_data: false, rows: [] },
  priority: 0,
  summaries: [],
  recentRoom: null,
  loading: false,
  error: null,
  lastFetchedAt: null,
  todosHtml: '',
  todosCount: 0,
  summariesHtml: '',
  summaryCount: 0,
};

export const $dashboard = atom<DashboardState>({ ...initialDashboardState });

/** Partial update */
export function updateDashboard(partial: Partial<DashboardState>): void {
  $dashboard.set({ ...$dashboard.get(), ...partial });
}

/** loading 시작 (모달 진입 시점) */
export function setDashboardLoading(userId: number): void {
  $dashboard.set({
    ...initialDashboardState,
    userId,
    loading: true,
  });
}

/** 모든 fetch 완료 후 — 한 번에 set */
export function setDashboardLoaded(payload: Partial<DashboardState> & { userId: number }): void {
  $dashboard.set({
    ...$dashboard.get(),
    ...payload,
    loading: false,
    error: null,
    lastFetchedAt: Date.now(),
  });
}

/** error */
export function setDashboardError(msg: string): void {
  $dashboard.set({
    ...$dashboard.get(),
    loading: false,
    error: msg,
  });
}

/** 모달 닫기 — reset */
export function closeDashboard(): void {
  $dashboard.set({ ...initialDashboardState });
}

/** snapshot */
export function getDashboard(): DashboardState {
  return $dashboard.get();
}

/** subscribe */
export function subscribeDashboard(cb: (s: DashboardState) => void): () => void {
  return $dashboard.subscribe(cb);
}

/* ============================================================
 * Global 노출 — admin-customer-dash.js (classic script) 호출용
 * ============================================================ */
export interface DashboardStoreGlobal {
  setLoading: (userId: number) => void;
  setLoaded: (payload: Partial<DashboardState> & { userId: number }) => void;
  setError: (msg: string) => void;
  update: (partial: Partial<DashboardState>) => void;
  close: () => void;
  get: () => DashboardState;
  subscribe: (cb: (s: DashboardState) => void) => () => void;
}

declare global {
  interface Window {
    __dashboardStore?: DashboardStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__dashboardStore = {
    setLoading: setDashboardLoading,
    setLoaded: setDashboardLoaded,
    setError: setDashboardError,
    update: updateDashboard,
    close: closeDashboard,
    get: getDashboard,
    subscribe: subscribeDashboard,
  };
}
