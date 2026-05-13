/**
 * Phase 14 (2026-05-12): /admin/* 라우트 에러 경계 (Next.js App Router).
 *
 * 어느 페이지에서든 throw 발생 시 이 컴포넌트가 fallback 으로 표시.
 * - error_logs API 로 자동 보고 (사장님 무당벌레 화면)
 * - reset() 으로 재시도 가능
 * - 사장님 친화 메시지 (raw stack X)
 */
'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* Phase 15 audit fix (2026-05-12): error_logs dedup.
 * 이전 사고 가능성: render-loop bug → 같은 digest 의 에러가 매 mount 마다 POST → 사장님
 * 무당벌레 사이드바 가짜 빨간 점 폭주. sessionStorage 로 같은 digest 중복 차단. */
const reportedDigests = new Set<string>();

function reportOnce(error: Error & { digest?: string }): void {
  const key = error.digest || `${error.name}:${error.message}`.slice(0, 200);
  if (reportedDigests.has(key)) return;
  reportedDigests.add(key);
  /* 추가 안전망: sessionStorage 도 마킹 (page reload 까지 유효) */
  try {
    const seen = JSON.parse(sessionStorage.getItem('_admin_err_seen') || '[]') as string[];
    if (seen.includes(key)) return;
    seen.push(key);
    if (seen.length > 50) seen.shift(); // bound size
    sessionStorage.setItem('_admin_err_seen', JSON.stringify(seen));
  } catch {
    /* private mode — silent */
  }
  fetch('/api/admin-error-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'admin',
      message: error.message?.slice(0, 500) || 'Unknown error',
      stack: error.stack?.slice(0, 2000),
      url: typeof window !== 'undefined' ? window.location.href : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      context: { digest: error.digest, route_error_boundary: true },
    }),
  }).catch(() => {
    /* 보고 자체 실패해도 fallback UI 는 표시 */
  });
}

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportOnce(error);
    /* 콘솔에도 — 개발 중 디버그 */
    // eslint-disable-next-line no-console
    console.error('[admin error boundary]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mb-4">
        <AlertTriangle size={32} className="text-red-600 dark:text-red-300" strokeWidth={1.8} />
      </div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
        화면 표시 중 오류가 발생했습니다
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-md">
        사장님 무당벌레 화면에 자동 보고됨. 잠시 후 다시 시도하시거나,
        문제 지속 시 페이지 새로고침해 주세요.
      </p>
      {error.digest && (
        <p className="mt-1 text-[11px] font-mono text-gray-400 dark:text-gray-500">
          Error ID: {error.digest}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Button variant="default" onClick={reset}>
          <RefreshCw size={14} className="mr-1.5" />
          다시 시도
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = '/admin/dashboard')}>
          대시보드로
        </Button>
      </div>
    </div>
  );
}
