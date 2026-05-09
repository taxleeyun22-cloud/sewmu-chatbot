/**
 * Phase Infra-1 (2026-05-09): Sentry 통합 — 자체 error logger 와 병행.
 *
 * 환경변수 `VITE_SENTRY_DSN` 있을 때만 init. 없으면 no-op.
 * 사장님이 Cloudflare Pages 에 SENTRY_DSN 등록 시 즉시 작동.
 *
 * 자체 admin-error-log 시스템은 그대로 유지 (CLAUDE.md "에러 로그 옵션 A" 룰).
 * Sentry 는 보강.
 */
import * as Sentry from '@sentry/react';

let _sentryInitialized = false;

export function initSentry(): void {
  if (_sentryInitialized) return;

  const dsn = (import.meta as { env?: Record<string, string> }).env?.VITE_SENTRY_DSN;
  if (!dsn) {
    /* DSN 없음 — Sentry 비활성. 자체 logger 만 작동. */
    return;
  }

  try {
    Sentry.init({
      dsn,
      // 환경 (prod / preview / dev)
      environment: location.hostname === 'sewmu-chatbot.pages.dev' ? 'production' : 'preview',
      // 릴리즈 (git commit hash — vite.config.ts 의 autoCacheBust 와 동일)
      release: (import.meta as { env?: Record<string, string> }).env?.VITE_RELEASE || 'unknown',
      // 성능 모니터링 (10% sample)
      tracesSampleRate: 0.1,
      // 에러 grouping
      ignoreErrors: [
        // 브라우저 extension 에러 무시
        'top.GLOBALS',
        'ResizeObserver loop limit exceeded',
        // 네트워크 일시 단절
        'NetworkError',
        'Failed to fetch',
      ],
      beforeSend(event) {
        /* admin_key URL 파라미터는 마스킹 */
        if (event.request?.url) {
          event.request.url = event.request.url.replace(/key=[^&]+/g, 'key=[REDACTED]');
        }
        return event;
      },
    });
    _sentryInitialized = true;
    console.log('[Sentry] 초기화 완료');
  } catch (err) {
    console.warn('[Sentry] 초기화 실패:', err);
  }
}

/**
 * 수동 에러 보고. 자체 logger + Sentry 양쪽 호출.
 */
export function reportError(error: Error | string, context?: Record<string, unknown>): void {
  const errObj = typeof error === 'string' ? new Error(error) : error;

  /* Sentry */
  if (_sentryInitialized) {
    try {
      Sentry.captureException(errObj, { extra: context });
    } catch {
      /* ignore */
    }
  }

  /* 자체 admin-error-log (admin.js 의 reportError 가 별도) — 호환 */
  console.error('[reportError]', errObj.message, context);
}

/**
 * Sentry 활성 여부.
 */
export function isSentryActive(): boolean {
  return _sentryInitialized;
}
