/**
 * src/main.ts — Vite entry (Phase S3a, 2026-05-04)
 *
 * 메타 12종 #7 SPA 라우팅 — 자체 Router boot.
 *
 * 단계:
 * - Phase S3a (현재): Router 인프라 등록 (window.__router 노출). 기존 multi-page 그대로 작동.
 * - Phase S3b: '/' → Chat, '/mypage' → MyPage, '/onboard' → Onboarding
 * - Phase S3c: '/admin/*' → AdminApp
 * - Phase S3d: '/office', '/business', '/memo-window', '/articles' → 각 view
 */

import './styles/globals.css';
import { defineRoute, navigate, start, back, onNavigate, getCurrent } from './router';
import {
  $roomMemoCache,
  $memoFilter,
  $cdMemoCache,
  $cdMemoCategory,
  $cdSelectedMemoIds,
  $trashSelectedIds,
} from './features/memos/state';
import type { Memo } from './features/memos/state';
import {
  $key,
  $isOwner,
  $currentRoomId,
  $currentRoomStatus,
  $userStatusFilter,
} from './features/shared/state';
import { extractTags, normalizeTags, kst, timingSafeEqual } from './lib/memo-utils';
import { ddayBadge, formatBytes, memoIcon, MEMO_CATEGORY_ICONS } from './lib/memo-render';
import type { DDayBadge } from './lib/memo-render';
import {
  listMemos,
  addMemo,
  updateMemo,
  deleteMemo,
  restoreMemo,
  purgeMemo,
  trashCount,
  isMemoError,
} from './lib/memo-actions';
import {
  normalizeMemoType,
  matchCdCategory,
  matchTag,
  sortMemos,
  filterMemos,
  ALLOWED_MEMO_TYPES,
} from './lib/memo-filter';
import { loadAdminModals, startModalLoader } from './admin/modal-loader';

/* Phase #7 적용 확장 (B, 2026-05-06): tab 변경 broadcast — admin.js tab() 호출 시
 * 다른 모듈 (admin-memos / admin-rooms / 등) 이 자동 알림 받기. */
type TabChangeListener = (tab: string) => void;
const _tabListeners: TabChangeListener[] = [];

function onTabChange(cb: TabChangeListener): () => void {
  _tabListeners.push(cb);
  return () => {
    const i = _tabListeners.indexOf(cb);
    if (i >= 0) _tabListeners.splice(i, 1);
  };
}

function broadcastTabChange(tab: string): void {
  for (const cb of _tabListeners) {
    try { cb(tab); } catch (e) { console.warn('[tabChange] listener error:', e); }
  }
}

/* 글로벌 노출 — classic script 환경에서 다른 .js 파일이 사용 가능하게.
   Phase S3b 부터 admin.js / index.js 등이 window.__router 통해 navigate 호출.
   Phase #6 적용 (2026-05-06): admin-memos.js 등이 window.__memoStore 사용. */
declare global {
  interface Window {
    __router?: {
      defineRoute: typeof defineRoute;
      navigate: typeof navigate;
      start: typeof start;
      back: typeof back;
      onNavigate: typeof onNavigate;
      getCurrent: typeof getCurrent;
    };
    __memoStore?: {
      $roomMemoCache: typeof $roomMemoCache;
      $memoFilter: typeof $memoFilter;
      $cdMemoCache: typeof $cdMemoCache;
      $cdMemoCategory: typeof $cdMemoCategory;
      $cdSelectedMemoIds: typeof $cdSelectedMemoIds;
      $trashSelectedIds: typeof $trashSelectedIds;
    };
    /* Phase #3 적용 (2026-05-06): TypeScript 검증 끝난 메모 utility 를 classic
       script (admin-memos.js / functions/api 가 아닌 곳) 가 호출 가능하게 노출.
       Vitest 단위 테스트 통과 검증. */
    __memoUtils?: {
      extractTags: typeof extractTags;
      normalizeTags: typeof normalizeTags;
      kst: typeof kst;
      timingSafeEqual: typeof timingSafeEqual;
    };
    /* Phase #3 적용: 메모 렌더 helpers (D-day / 사이즈 / 아이콘) */
    __memoRender?: {
      ddayBadge: typeof ddayBadge;
      formatBytes: typeof formatBytes;
      memoIcon: typeof memoIcon;
      MEMO_CATEGORY_ICONS: typeof MEMO_CATEGORY_ICONS;
    };
    /* Phase #6 적용 확장 (2026-05-06): 공유 상태 store — admin.js KEY / currentRoomId 등 */
    __sharedStore?: {
      $key: typeof $key;
      $isOwner: typeof $isOwner;
      $currentRoomId: typeof $currentRoomId;
      $currentRoomStatus: typeof $currentRoomStatus;
      $userStatusFilter: typeof $userStatusFilter;
    };
    /* Phase #3 적용 확장 (2-2, 2026-05-06): 메모 필터·정렬 helpers */
    __memoFilter?: {
      normalizeMemoType: typeof normalizeMemoType;
      matchCdCategory: typeof matchCdCategory;
      matchTag: typeof matchTag;
      sortMemos: typeof sortMemos;
      filterMemos: typeof filterMemos;
      ALLOWED_MEMO_TYPES: typeof ALLOWED_MEMO_TYPES;
    };
    /* Phase #3 적용 확장 (2026-05-06): type-safe 메모 CRUD wrapper */
    __memoActions?: {
      listMemos: typeof listMemos;
      addMemo: typeof addMemo;
      updateMemo: typeof updateMemo;
      deleteMemo: typeof deleteMemo;
      restoreMemo: typeof restoreMemo;
      purgeMemo: typeof purgeMemo;
      trashCount: typeof trashCount;
      isMemoError: typeof isMemoError;
    };
    /* Phase #1 적용 (2-3, 2026-05-06): ES module 로 작성된 modal-loader 노출.
     * admin.html 의 inline <script> 가 호출 가능. */
    __loadAdminModals?: typeof loadAdminModals;
    /* Phase #7 적용 확장 (B): tab 변경 broadcast / listen. */
    __onTabChange?: typeof onTabChange;
    __broadcastTabChange?: typeof broadcastTabChange;
    Memo?: Memo;  /* 타입 hint (실제 사용 X) */
    DDayBadge?: DDayBadge;  /* 타입 hint */
  }
}

if (typeof window !== 'undefined') {
  window.__router = { defineRoute, navigate, start, back, onNavigate, getCurrent };
  window.__memoStore = {
    $roomMemoCache,
    $memoFilter,
    $cdMemoCache,
    $cdMemoCategory,
    $cdSelectedMemoIds,
    $trashSelectedIds,
  };
  window.__sharedStore = {
    $key,
    $isOwner,
    $currentRoomId,
    $currentRoomStatus,
    $userStatusFilter,
  };
  window.__memoUtils = { extractTags, normalizeTags, kst, timingSafeEqual };
  window.__memoRender = { ddayBadge, formatBytes, memoIcon, MEMO_CATEGORY_ICONS };
  window.__memoActions = {
    listMemos,
    addMemo,
    updateMemo,
    deleteMemo,
    restoreMemo,
    purgeMemo,
    trashCount,
    isMemoError,
  };
  window.__memoFilter = {
    normalizeMemoType,
    matchCdCategory,
    matchTag,
    sortMemos,
    filterMemos,
    ALLOWED_MEMO_TYPES,
  };
  window.__loadAdminModals = loadAdminModals;
  window.__onTabChange = onTabChange;
  window.__broadcastTabChange = broadcastTabChange;
  /* Phase #1 적용 (2-3): admin.html 의 인라인 modal loader → ES module 로 자동 시작 */
  if (location.pathname.endsWith('/admin.html') || location.pathname === '/admin') {
    startModalLoader();
  }
}

/* Phase S3a: router 인스턴스만 노출. start() 는 Phase S3b 에서 route 정의 후.
   현재는 multi-page 그대로 작동 (classic script 가 각 HTML 의 logic 처리). */

export {};
