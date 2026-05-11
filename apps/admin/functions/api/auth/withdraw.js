// 회원 탈퇴 — 사장님 명령 (2026-05-07): 자동 복구 폐지.
// 다시 카카오 로그인 시 새 user (pending) 생성 + admin 화면에 옛 탈퇴자 알림.
//
// 흐름:
// 1. 옛 user.provider_id 백업 → withdrawn_provider_id 컬럼
// 2. provider_id = 'withdrawn:' + 원본 → ON CONFLICT 매칭 안 됨
// 3. approval_status='withdrawn' + deleted_at = now
// 4. 같은 카카오 다시 로그인 → 새 user (pending) → kakao.js 가 withdrawn_provider_id 매칭 → 옛 user 발견 → previous_withdrawn_user_id 저장
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
    /* 사장님 명령 (2026-05-07): 옛 OAuth ID 백업 컬럼 + 다시 가입 시 매칭 위해 */
    try { await db.prepare(`ALTER TABLE users ADD COLUMN withdrawn_provider_id TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN previous_withdrawn_user_id INTEGER`).run(); } catch {}

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

    /* 옛 OAuth ID (provider_id) 백업 + 무효화 */
    const u = await db.prepare(`SELECT provider, provider_id FROM users WHERE id = ?`).bind(userId).first();
    const origProviderId = u?.provider_id || null;
    /* provider_id = 'withdrawn:OLD' 형태로 무효화 (UNIQUE 제약 유지) */
    const newProviderId = origProviderId ? `withdrawn:${userId}:${origProviderId}` : `withdrawn:${userId}`;

    await db.prepare(
      `UPDATE users SET
        deleted_at = datetime('now', '+9 hours'),
        withdrawal_reason = ?,
        approval_status = 'withdrawn',
        withdrawn_provider_id = ?,
        provider_id = ?
       WHERE id = ?`
    ).bind(reason || null, origProviderId, newProviderId, userId).run();

    /* provider_user_id 도 같이 무효화 (있으면) — admin 코드가 둘 다 사용하니 */
    try {
      await db.prepare(`UPDATE users SET provider_user_id = ? WHERE id = ? AND provider_user_id IS NOT NULL`)
        .bind(newProviderId, userId).run();
    } catch {}

    await db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();

    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    headers.append("Set-Cookie", `session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    console.error("withdraw error:", e);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
