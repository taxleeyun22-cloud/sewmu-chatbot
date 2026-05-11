// 로그인 사용자의 대화 이력 조회 (초기화 이후 것만)
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ messages: [] });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ messages: [] });

  try {
    const session = await db.prepare(`
      SELECT s.user_id, u.cleared_at FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).bind(match[1]).first();

    if (!session) return Response.json({ messages: [] });

    // cleared_at 이후 대화만 조회. 상담방(room_id) 메시지는 제외 (1:1 AI 챗봇만)
    let query, params;
    if (session.cleared_at) {
      query = `SELECT role, content, created_at FROM conversations
        WHERE user_id = ? AND role IN ('user', 'assistant')
          AND (room_id IS NULL OR room_id = '')
          AND created_at > ?
        ORDER BY created_at DESC LIMIT 100`;
      params = [session.user_id, session.cleared_at];
    } else {
      query = `SELECT role, content, created_at FROM conversations
        WHERE user_id = ? AND role IN ('user', 'assistant')
          AND (room_id IS NULL OR room_id = '')
        ORDER BY created_at DESC LIMIT 100`;
      params = [session.user_id];
    }

    const { results } = await db.prepare(query).bind(...params).all();
    const messages = (results || []).reverse();

    return Response.json({ messages });
  } catch (e) {
    return Response.json({ messages: [] });
  }
}
