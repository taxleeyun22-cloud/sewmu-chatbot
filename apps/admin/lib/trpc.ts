/**
 * Phase Next-Day27 (2026-05-11): tRPC client (apps/admin) — query/mutation 자동 분기.
 *
 * tRPC fetchRequestHandler 는 query=GET, mutation=POST 강제.
 * 클라이언트가 procedure 이름으로 자동 분기.
 */
import type { AppRouter } from '@sewmu/api';

/* mutation 패턴 — 이 이름으로 끝나면 POST. 나머지는 query (GET). */
const MUTATION_PATTERN =
  /\.(create|update|delete|approve|reject|send|set[A-Z]\w*|save[A-Z]?\w*|link\w*|unlink\w*|remove|mark\w+|report|unreport|resolve|clearOld|clearAll|setVerified|patchFields|setConfidence|setAdmin|linkBusiness|unlinkBusiness|reopen|close|rename|addToUser|preview|log|restore|purge|upload|templateSave)$/;

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
    /* query — input 을 URL query string 으로 */
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
