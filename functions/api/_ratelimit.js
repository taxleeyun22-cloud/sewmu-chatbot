// 간이 레이트리밋 — D1 기반, 슬라이딩 윈도우
// 같은 스토리지를 여러 엔드포인트가 공유. 비용 미미.

async function ensureTable(db) {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS rate_limit (
      k TEXT NOT NULL,
      ts INTEGER NOT NULL,
      PRIMARY KEY (k, ts)
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_rate_limit_k ON rate_limit(k, ts)`).run();
  } catch {}
}

/**
 * @param db D1 binding
 * @param key 요청 분류 키 (ex: 'auth:1.2.3.4')
 * @param limit 윈도우 내 최대 요청 수
 * @param windowSec 윈도우 초 (ex: 60)
 * @returns {ok:boolean, remaining:number, retryAfter?:number}
 */
export async function rateLimit(db, key, limit, windowSec) {
  if (!db || !key) return { ok: true, remaining: limit };
  await ensureTable(db);
  const now = Math.floor(Date.now() / 1000);
  const since = now - windowSec;
  try {
    /* 오래된 건 정리 (확률적) */
    if (Math.random() < 0.05) {
      await db.prepare(`DELETE FROM rate_limit WHERE ts < ?`).bind(now - 3600).run();
    }
    const row = await db.prepare(
      `SELECT COUNT(*) as c FROM rate_limit WHERE k = ? AND ts >= ?`
    ).bind(key, since).first();
    const count = Number(row?.c || 0);
    if (count >= limit) {
      return { ok: false, remaining: 0, retryAfter: windowSec };
    }
    await db.prepare(`INSERT INTO rate_limit (k, ts) VALUES (?, ?)`).bind(key, now).run();
    return { ok: true, remaining: limit - count - 1 };
  } catch {
    /* DB 오류 시 fail-open (서비스 중단보다는 통과가 안전) */
    return { ok: true, remaining: limit };
  }
}

export function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
      || 'unknown';
}

/**
 * Phase 14 (2026-05-12): Response-based wrapper — admin endpoint 표준 패턴.
 *
 * 사용:
 *   const limited = await rateLimitResponse(context, { key: 'admin-mutation', limit: 60, windowSec: 60 });
 *   if (limited) return limited;  // 429 Response
 *
 * @param context Cloudflare Pages function context
 * @param opts.key 카운터 prefix (client IP 자동 append)
 * @param opts.limit 윈도우 안 최대 요청 수 (default 60)
 * @param opts.windowSec 윈도우 초 (default 60)
 * @param opts.identifier client identifier — default = getClientIP(request)
 * @returns Response 429 (차단) 또는 null (통과)
 */
export async function rateLimitResponse(context, opts = {}) {
  const limit = opts.limit ?? 60;
  const windowSec = opts.windowSec ?? 60;
  const id = opts.identifier || getClientIP(context.request);
  const key = `${opts.key || 'default'}:${id}`;
  const db = context.env?.DB;
  const r = await rateLimit(db, key, limit, windowSec);
  if (r.ok) return null;
  return new Response(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      retry_after_seconds: r.retryAfter || windowSec,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(r.retryAfter || windowSec),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

/* 편의 함수 — admin POST mutation 표준 (60 req/min/IP) */
export async function rateLimitAdminMutation(context) {
  return rateLimitResponse(context, {
    key: 'admin-mutation',
    limit: 60,
    windowSec: 60,
  });
}

/* 편의 함수 — login (brute-force 차단 — 10 req/min/IP) */
export async function rateLimitAuth(context) {
  return rateLimitResponse(context, {
    key: 'auth',
    limit: 10,
    windowSec: 60,
  });
}
