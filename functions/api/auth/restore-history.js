// 사용자 대화 이력 복구 (cleared_at = NULL 로 되돌림)
// clear-history는 soft delete(cleared_at 기록)만 하므로 복구 가능
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ ok: false, error: "세션 없음" });

  try {
    const session = await db.prepare(`
      SELECT user_id FROM sessions
      WHERE token = ? AND expires_at > datetime('now')
    `).bind(match[1]).first();
    if (!session) return Response.json({ ok: false, error: "세션 만료" });

    await db.prepare(
      `UPDATE users SET cleared_at = NULL WHERE id = ?`
    ).bind(session.user_id).run();

    // 복구된 대화 개수 반환
    const cnt = await db.prepare(
      `SELECT COUNT(*) as n FROM conversations WHERE user_id = ? AND role IN ('user', 'assistant') AND (room_id IS NULL OR room_id = '')`
    ).bind(session.user_id).first();

    return Response.json({ ok: true, restored_count: cnt?.n || 0 });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}
