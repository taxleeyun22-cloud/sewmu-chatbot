// 개인정보 국외이전 동의 (개인정보보호법 제28조의8)
// GET  : 현재 로그인 사용자의 동의 상태 반환
// POST : 동의 처리 (consent_overseas=1, consent_overseas_at=now)

async function ensureColumns(db) {
  try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_overseas INTEGER DEFAULT 0`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_overseas_at TEXT`).run(); } catch {}
}

async function getUserId(db, request) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/session=([^;]+)/);
  if (!m) return null;
  try {
    const s = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(m[1]).first();
    return s ? s.user_id : null;
  } catch { return null; }
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureColumns(db);
  const userId = await getUserId(db, context.request);
  if (!userId) return Response.json({ error: "로그인 필요" }, { status: 401 });
  try {
    const u = await db.prepare(
      `SELECT consent_overseas, consent_overseas_at FROM users WHERE id = ?`
    ).bind(userId).first();
    return Response.json({
      consent_overseas: u?.consent_overseas ? true : false,
      consent_overseas_at: u?.consent_overseas_at || null,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureColumns(db);
  const userId = await getUserId(db, context.request);
  if (!userId) return Response.json({ error: "로그인 필요" }, { status: 401 });

  let body = {};
  try { body = await context.request.json(); } catch {}
  const agree = body.agree === true || body.agree === 1 || body.agree === "1";
  if (!agree) return Response.json({ error: "동의가 필요합니다" }, { status: 400 });

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
  try {
    await db.prepare(
      `UPDATE users SET consent_overseas = 1, consent_overseas_at = ? WHERE id = ?`
    ).bind(now, userId).run();
    return Response.json({ ok: true, consent_overseas_at: now });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
