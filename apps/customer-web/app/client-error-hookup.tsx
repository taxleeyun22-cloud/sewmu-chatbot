/**
 * Phase Next-Day27 (2026-05-11): 거래처 챗봇 client-side 에러 자동 보고.
 *
 * 거래처 사장님 브라우저에서 JS 에러 발생 시 → /api/trpc/errorLogs.log 자동 호출.
 * CLAUDE.md "🐞 옵션 A 룰" — 자동 D1 저장, 사장님이 무당벌레 페이지에서 분석.
 *
 * 사용 (apps/customer-web/app/layout.tsx):
 *   import { ClientErrorHookup } from './client-error-hookup';
 *   <ClientErrorHookup source="customer" />
 */
'use client';

import { useEffect } from 'react';

export function ClientErrorHookup({ source }: { source: 'customer' | 'admin' | 'mypage' | 'chat' }) {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      reportError({
        source,
        message: event.message || 'unknown',
        stack: event.error?.stack?.slice(0, 4000),
        url: window.location.href,
        user_agent: navigator.userAgent.slice(0, 500),
      });
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason as Error | string;
      reportError({
        source,
        message:
          typeof reason === 'string'
            ? reason
            : reason?.message || 'unhandled promise rejection',
        stack: typeof reason === 'string' ? undefined : reason?.stack?.slice(0, 4000),
        url: window.location.href,
        user_agent: navigator.userAgent.slice(0, 500),
      });
    };

    window.addEventListener('error', handler);
    window.addEventListener('unhandledrejection', rejectionHandler);

    return () => {
      window.removeEventListener('error', handler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, [source]);

  return null;
}

async function reportError(payload: {
  source: string;
  message: string;
  stack?: string;
  url?: string;
  user_agent?: string;
}) {
  /* DoS guard — 같은 메시지 1분 안 반복 무시. */
  const key = `${payload.source}|${payload.message.slice(0, 100)}`;
  const now = Date.now();
  const recent = (window as unknown as { __errorReportCache?: Record<string, number> })
    .__errorReportCache;
  if (recent && recent[key] && now - recent[key] < 60000) return;
  (window as unknown as { __errorReportCache: Record<string, number> }).__errorReportCache = {
    ...(recent || {}),
    [key]: now,
  };

  try {
    await fetch('/api/trpc/errorLogs.log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: payload }),
    });
  } catch {
    /* 에러 보고 실패해도 사용자에게 영향 X. */
  }
}
