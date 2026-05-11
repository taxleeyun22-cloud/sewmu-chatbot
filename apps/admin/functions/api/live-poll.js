// 사용자용 폴링: 현재 세션에 새 human_advisor 메시지 있는지 체크
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ messages: [] });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: "로그인 필요" }, { status: 401 });

  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get("session");
  const since = url.searchParams.get("since"); // ISO timestamp, 이 이후 메시지만

  if (!sessionId) return Response.json({ messages: [] });

  try {
    const sessionRow = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(match[1]).first();
    if (!sessionRow) return Response.json({ error: "세션 만료" }, { status: 401 });
    const userId = sessionRow.user_id;

    // live_sessions 상태 (ai_mode)
    let aiMode = 'on';
    try {
      const ls = await db.prepare(
        `SELECT ai_mode FROM live_sessions WHERE session_id = ? AND user_id = ?`
      ).bind(sessionId, userId).first();
      if (ls) aiMode = ls.ai_mode || 'on';
    } catch {}

    // 최근 human_advisor 메시지 조회
    let query = `
      SELECT id, role, content, created_at
      FROM conversations
      WHERE session_id = ? AND user_id = ? AND role = 'human_advisor'
    `;
    const binds = [sessionId, userId];
    if (since) {
      query += ` AND created_at > ?`;
      binds.push(since);
    }
    query += ` ORDER BY created_at ASC LIMIT 20`;

    const { results } = await db.prepare(query).bind(...binds).all();

    // 사용자가 메시지 확인한 것으로 처리 (user_unread = 0)
    if (results && results.length > 0) {
      try {
        await db.prepare(
          `UPDATE live_sessions SET user_unread = 0 WHERE session_id = ? AND user_id = ?`
        ).bind(sessionId, userId).run();
      } catch {}
    }

    return Response.json({
      messages: results || [],
      ai_mode: aiMode,
    });
  } catch (e) {
    /* 보안: 내부 에러 미노출 */
    return Response.json({ error: "처리 실패" }, { status: 500 });
  }
}
