/**
 * Phase Next-Day6 (2026-05-09): tRPC client (apps/admin).
 *
 * Server Components: createCaller (직접 호출)
 * Client Components: createTRPCReact (React hooks)
 */
import type { AppRouter } from '@sewmu/api';

// Server Components (RSC) — 향후 server-side caller 사용 시
// import { createCallerFactory } from '@sewmu/api';
// import { appRouter } from '@sewmu/api';

// Client Components — fetch wrapper (Day 6 단순 버전, Day 7 부터 @trpc/react-query 추가)
export async function trpcCall<T>(
  procedure: string,
  input?: unknown,
): Promise<T> {
  const url = `/api/trpc/${procedure}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`tRPC error: ${res.status} ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { result?: { data?: T } };
  return data.result?.data as T;
}

export type { AppRouter };
