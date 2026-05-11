/**
 * Phase Next-Day27 (2026-05-11): admin client-side 에러 자동 보고.
 * apps/customer-web 와 동일 hook, source='admin'.
 */
'use client';

import { useEffect } from 'react';

export function ClientErrorHookup({ source }: { source: string }) {
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
          typeof reason === 'string' ? reason : reason?.message || 'unhandled rejection',
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
    /* graceful */
  }
}
