/**
 * Phase #3 Phase 4-2 (2026-05-06): lazy <script> loader 통합 .ts.
 *
 * admin.html 안 inline IIFE (lazyAnalReviewFaq, lazyDocs) 패턴을 통합.
 * 새로운 lazy 모듈 추가 시 이 helper 한 번 호출.
 *
 * 사용 (admin.html 또는 main.ts):
 *   import { registerLazyScript } from '@/admin/lazy-loaders';
 *
 *   registerLazyScript({
 *     src: '/admin-anal-review-faq.js?v=2',
 *     triggerTabs: ['anal', 'review', 'faq'],
 *   });
 */

export interface LazyScriptConfig {
  /** 동적 로드할 .js 경로 (cache buster 포함) */
  src: string;
  /** 어느 탭 클릭 시 로드 ('anal' | 'review' | 'faq' | etc) */
  triggerTabs: string[];
  /** 로드 완료 후 callback (선택) */
  onLoad?: () => void;
  /** 로드 실패 시 callback (선택) */
  onError?: (error: Error) => void;
}

interface LazyScriptHandle {
  loaded: boolean;
  loading: boolean;
  config: LazyScriptConfig;
}

const _lazyScripts: LazyScriptHandle[] = [];

/**
 * <script> 태그 동적 추가. 이미 로드된 거 있으면 skip.
 */
function injectScript(handle: LazyScriptHandle): void {
  if (handle.loaded || handle.loading) return;
  handle.loading = true;
  if (typeof document === 'undefined') return;
  const s = document.createElement('script');
  s.src = handle.config.src;
  s.async = false;
  s.onload = () => {
    handle.loaded = true;
    handle.loading = false;
    if (typeof console !== 'undefined' && console.debug) {
      console.debug(`[lazy] loaded ${handle.config.src}`);
    }
    handle.config.onLoad?.();
  };
  s.onerror = () => {
    handle.loading = false;
    const err = new Error(`failed to load ${handle.config.src}`);
    if (typeof console !== 'undefined') console.error('[lazy] error:', err);
    handle.config.onError?.(err);
  };
  document.head.appendChild(s);
}

/**
 * lazy script 등록. window.__onTabChange 통해 트리거 탭 클릭 시 로드.
 */
export function registerLazyScript(config: LazyScriptConfig): void {
  const handle: LazyScriptHandle = { loaded: false, loading: false, config };
  _lazyScripts.push(handle);

  /* tab change listener 등록 — main.ts 의 window.__onTabChange 사용 */
  function tryHook(): void {
    if (typeof window === 'undefined') return;
    const onTabChange = (window as Window & { __onTabChange?: (cb: (tab: string) => void) => void })
      .__onTabChange;
    if (typeof onTabChange === 'function') {
      onTabChange((tab: string) => {
        if (config.triggerTabs.includes(tab)) injectScript(handle);
      });
    } else {
      /* main.ts 가 아직 로드 안 됨 — 200ms 후 재시도 */
      setTimeout(tryHook, 200);
    }
  }
  tryHook();
}

/**
 * 강제 로드 (테스트 / 수동 호출용).
 */
export function forceLoad(src: string): boolean {
  const handle = _lazyScripts.find((h) => h.config.src === src);
  if (!handle) return false;
  injectScript(handle);
  return true;
}

/**
 * 등록된 lazy script 갯수 (테스트용).
 */
export function getLazyScriptCount(): number {
  return _lazyScripts.length;
}

/**
 * 특정 src 의 로드 상태 (테스트용).
 */
export function isLazyScriptLoaded(src: string): boolean {
  const handle = _lazyScripts.find((h) => h.config.src === src);
  return handle ? handle.loaded : false;
}

/* 테스트 환경에서 등록 list 비우기 */
export function _resetLazyScripts(): void {
  _lazyScripts.length = 0;
}
