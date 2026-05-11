// 사용자의 Web Push 구독 정보 저장
// POST body: { endpoint, keys: { p256dh, auth } }
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: "로그인 필요" }, { status: 401 });

  try {
    const session = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(match[1]).first();
    if (!session) return Response.json({ error: "세션 만료" }, { status: 401 });

    await db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT
    )`).run();

    const body = await context.request.json();
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!endpoint || !p256dh || !auth) return Response.json({ error: "invalid" }, { status: 400 });
    /* 보안: endpoint는 실제 push 서비스만 허용 (임의 SSRF 대상 URL 저장 방지) */
    if (typeof endpoint !== 'string' || endpoint.length > 1024) {
      return Response.json({ error: "invalid endpoint" }, { status: 400 });
    }
    try {
      const epHost = new URL(endpoint).hostname;
      const allowed = [
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'web.push.apple.com',
        'wns2-db3p.notify.windows.com',
      ];
      if (!allowed.some(h => epHost === h || epHost.endsWith('.' + h.split('.').slice(-2).join('.')))) {
        return Response.json({ error: "허용되지 않은 push endpoint" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "invalid endpoint url" }, { status: 400 });
    }
    if (typeof p256dh !== 'string' || p256dh.length > 200) return Response.json({ error: "invalid key" }, { status: 400 });
    if (typeof auth !== 'string' || auth.length > 100) return Response.json({ error: "invalid key" }, { status: 400 });

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const ua = context.request.headers.get("User-Agent") || "";

    await db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key
    `).bind(session.user_id, endpoint, p256dh, auth, ua, kst).run();

    return Response.json({ ok: true });
  } catch (e) {
    /* 보안: 내부 에러 미노출 */
    return Response.json({ error: "처리 실패" }, { status: 500 });
  }
}

// GET: VAPID 공개키 반환 (환경변수에서)
export async function onRequestGet(context) {
  return Response.json({
    vapid_public_key: context.env.VAPID_PUBLIC_KEY || ""
  });
}

// DELETE: 구독 해제
export async function onRequestDelete(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: "로그인 필요" }, { status: 401 });

  try {
    const session = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(match[1]).first();
    if (!session) return Response.json({ error: "세션 만료" }, { status: 401 });

    await db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT
    )`).run();

    const url = new URL(context.request.url);
    const endpoint = url.searchParams.get("endpoint");
    if (endpoint) {
      await db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`).bind(session.user_id, endpoint).run();
    } else {
      await db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ?`).bind(session.user_id).run();
    }
    return Response.json({ ok: true });
  } catch (e) {
    /* 보안: 내부 에러 미노출 */
    return Response.json({ error: "처리 실패" }, { status: 500 });
  }
}
