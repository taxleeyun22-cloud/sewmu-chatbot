/**
 * Phase A (2026-05-08 사장님 명령 — 3단계 React 마이그레이션 1번째 phase):
 * 사이드바 카운트 nanostore. 인프라만 도입 — UI 변화 0.
 *
 * 흐름:
 *   1. admin.js refreshSidebarCounts 가 fetch 후 → DOM 조작 + window.__sidebarStore.update() 둘 다
 *   2. nanostore 가 변경 통지 → 향후 React 컴포넌트가 자동 reactive update
 *   3. 현재 (Phase A): React 컴포넌트 X — store 만 채워둠. 사장님 화면 영향 0.
 *   4. 향후 (Phase B): admin.html 의 사이드바 카운트 element 를 React 컴포넌트로 점진 교체
 *
 * 안전: classic script (admin.js) 가 window.__sidebarStore 통해 호출 — 기존 코드 변경 최소.
 */
import { atom } from 'nanostores';

export interface SidebarCountsState {
  /* 사용자 총합 (대기 + 기장거래처 + 일반승인 + 거절 + 종료 + 재가입 + 관리자) */
  userTotal: number;
  /* 업체 총합 */
  bizTotal: number;
  /* 휴지통 (deleted_at NOT NULL 메모) */
  trash: number;
  /* 임박 일정 (오늘 + 오버듀 + 3일 이내) */
  urgentTodos: number;
  /* 관리자방 안 읽음 */
  internalUnread: number;
  /* 7일 이내 에러 */
  errorLog: number;
  /* status 별 (사장님이 사이드바 또는 메인탭에서 직접 보는 값) */
  pending: number;
  approvedClient: number;
  approvedGuest: number;
  rejected: number;
  terminated: number;
  rejoined: number;
  admin: number;
  /* 마지막 갱신 시각 (디버깅·모니터링용) */
  lastUpdatedAt: number | null;
}

export const initialSidebarCounts: SidebarCountsState = {
  userTotal: 0,
  bizTotal: 0,
  trash: 0,
  urgentTodos: 0,
  internalUnread: 0,
  errorLog: 0,
  pending: 0,
  approvedClient: 0,
  approvedGuest: 0,
  rejected: 0,
  terminated: 0,
  rejoined: 0,
  admin: 0,
  lastUpdatedAt: null,
};

export const $sidebarCounts = atom<SidebarCountsState>({ ...initialSidebarCounts });

/** Partial update — 변경된 컬럼만 명시 */
export function updateSidebarCounts(partial: Partial<SidebarCountsState>): void {
  $sidebarCounts.set({
    ...$sidebarCounts.get(),
    ...partial,
    lastUpdatedAt: Date.now(),
  });
}

/** Total reset — 테스트 또는 logout 시 */
export function resetSidebarCounts(): void {
  $sidebarCounts.set({ ...initialSidebarCounts });
}

/** 현재 값 fetch (snapshot) */
export function getSidebarCounts(): SidebarCountsState {
  return $sidebarCounts.get();
}

/** Subscribe — 변경 감지 (React 컴포넌트는 useStore hook 사용 권장) */
export function subscribeSidebarCounts(
  cb: (counts: SidebarCountsState) => void,
): () => void {
  return $sidebarCounts.subscribe(cb);
}

/* ============================================================
 * Global 노출 — admin.js (classic script) 에서 호출 위해
 * window.__sidebarStore.update({ pending: 5, admin: 4 }) 패턴
 * ============================================================ */
export interface SidebarStoreGlobal {
  update: (partial: Partial<SidebarCountsState>) => void;
  get: () => SidebarCountsState;
  reset: () => void;
  subscribe: (cb: (s: SidebarCountsState) => void) => () => void;
}

declare global {
  interface Window {
    __sidebarStore?: SidebarStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__sidebarStore = {
    update: updateSidebarCounts,
    get: getSidebarCounts,
    reset: resetSidebarCounts,
    subscribe: subscribeSidebarCounts,
  };
}
