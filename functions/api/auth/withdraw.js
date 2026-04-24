// 회원 탈퇴 (soft delete). 같은 카톡/네이버로 재로그인하면 자동 복구됨.
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: "db_error" }, { status: 500 });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ ok: false, error: "not_logged_in" }, { status: 401 });

  const token = match[1];

  try {
    try { await db.prepare(`ALTER TABLE users ADD COLUMN deleted_at TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN withdrawal_reason TEXT`).run(); } catch {}

    const session = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(token).first();
    if (!session) return Response.json({ ok: false, error: "session_expired" }, { status: 401 });

    const userId = session.user_id;
    let reason = "";
    try {
      const body = await context.request.json();
      reason = String(body?.reason || "").slice(0, 200);
    } catch {}

    await db.prepare(
      `UPDATE users SET deleted_at = datetime('now', '+9 hours'), withdrawal_reason = ? WHERE id = ?`
    ).bind(reason || null, userId).run();

    await db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();

    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    headers.append("Set-Cookie", `session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    console.error("withdraw error:", e);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
