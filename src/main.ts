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
    Memo?: Memo;  /* 타입 hint (실제 사용 X) */
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
}

/* Phase S3a: router 인스턴스만 노출. start() 는 Phase S3b 에서 route 정의 후.
   현재는 multi-page 그대로 작동 (classic script 가 각 HTML 의 logic 처리). */

export {};
