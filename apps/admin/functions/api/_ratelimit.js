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
