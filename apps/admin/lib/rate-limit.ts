/**
 * Phase 14 (2026-05-12): Edge runtime rate limit helper.
 *
 * Cloudflare D1 의 `rate_limit` 테이블 공유 (옛 admin 의 functions/api/_rateLimit.js
 * 와 동일 스토리지 — 사용자 IP 한 곳에서 추적).
 *
 * 사용 (Next.js Route Handler):
 *   const limited = await rateLimit(env.DB, `admin-login:${ip}`, 10, 60);
 *   if (!limited.ok) return new Response('rate_limit', { status: 429 });
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter?: number;
}

async function ensureTable(db: any): Promise<void> {
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS rate_limit (
          k TEXT NOT NULL,
          ts INTEGER NOT NULL,
          PRIMARY KEY (k, ts)
        )`,
      )
      .run();
  } catch {
    /* 권한/이미 존재 — 무시 */
  }
}

/**
 * sliding window — 옛 admin _rateLimit.js 와 동일 알고리즘.
 *
 * @param db Cloudflare D1 binding
 * @param key 카운터 키 (이미 client identifier 포함 — 예: `admin-login:1.2.3.4`)
 * @param limit 윈도우 안 최대 요청 수
 * @param windowSec 윈도우 초
 */
export async function rateLimit(
  db: any,
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  if (!db || !key) return { ok: true, remaining: limit };
  await ensureTable(db);
  const now = Math.floor(Date.now() / 1000);
  const since = now - windowSec;
  try {
    /* 확률적 cleanup (5%) */
    if (Math.random() < 0.05) {
      await db.prepare(`DELETE FROM rate_limit WHERE ts < ?`).bind(now - 3600).run();
    }
    const row = await db
      .prepare(`SELECT COUNT(*) AS c FROM rate_limit WHERE k = ? AND ts >= ?`)
      .bind(key, since)
      .first();
    const count = Number((row as { c?: number } | null)?.c || 0);
    if (count >= limit) {
      return { ok: false, remaining: 0, retryAfter: windowSec };
    }
    await db.prepare(`INSERT INTO rate_limit (k, ts) VALUES (?, ?)`).bind(key, now).run();
    return { ok: true, remaining: limit - count - 1 };
  } catch {
    /* fail-open — 사장님 작업 차단 X */
    return { ok: true, remaining: limit };
  }
}

/** Cloudflare cf-connecting-ip 우선 → x-forwarded-for fallback. */
export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/** 429 Response 헬퍼 — 표준 헤더 (Retry-After / X-RateLimit-*). */
export function rateLimited(retryAfterSec: number, limit = 0): Response {
  return new Response(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      retry_after_seconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
