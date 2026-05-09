/**
 * Phase Next-Day13 (2026-05-09): tRPC client (apps/customer-web).
 */
import type { AppRouter } from '@sewmu/api';

export async function trpcCall<T>(procedure: string, input?: unknown): Promise<T> {
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
  const data = await res.json();
  return data.result?.data as T;
}

export type { AppRouter };
