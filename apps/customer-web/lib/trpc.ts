/**
 * Phase Next-Day27 (2026-05-11): tRPC client (apps/customer-web).
 * query=GET / mutation=POST 자동 분기.
 */
import type { AppRouter } from '@sewmu/api';

const MUTATION_PATTERN =
  /\.(create|update|delete|approve|reject|send|set[A-Z]\w*|link\w*|unlink\w*|remove|mark\w+|report|unreport|resolve|clearOld|clearAll|setVerified|patchFields|setConfidence|setAdmin|linkBusiness|unlinkBusiness|reopen|close|rename|addToUser|preview|log|restore|purge|upload)$/;

function isMutation(procedure: string): boolean {
  return MUTATION_PATTERN.test(procedure);
}

export async function trpcCall<T>(procedure: string, input?: unknown): Promise<T> {
  const mutation = isMutation(procedure);
  let res: Response;
  if (mutation) {
    res = await fetch(`/api/trpc/${procedure}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
  } else {
    const inputStr = encodeURIComponent(JSON.stringify(input ?? {}));
    res = await fetch(`/api/trpc/${procedure}?input=${inputStr}`);
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`tRPC error: ${res.status} ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { result?: { data?: T } };
  return data.result?.data as T;
}

export type { AppRouter };
