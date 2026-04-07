// 사용자 대화 이력 초기화 (DB에서는 삭제 안 함, cleared_at 기록)
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ ok: false });

  try {
    const session = await db.prepare(`
      SELECT user_id FROM sessions
      WHERE token = ? AND expires_at > datetime('now')
    `).bind(match[1]).first();

    if (!session) return Response.json({ ok: false });

    // users 테이블에 cleared_at 컬럼 추가 (없으면)
    try {
      await db.prepare(`ALTER TABLE users ADD COLUMN cleared_at TEXT`).run();
    } catch {}

    // 현재 시간을 cleared_at에 기록
    await db.prepare(
      `UPDATE users SET cleared_at = datetime('now') WHERE id = ?`
    ).bind(session.user_id).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}
