// 로그인 사용자의 대화 이력 조회
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ messages: [] });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ messages: [] });

  try {
    const session = await db.prepare(`
      SELECT user_id FROM sessions
      WHERE token = ? AND expires_at > datetime('now')
    `).bind(match[1]).first();

    if (!session) return Response.json({ messages: [] });

    // 해당 사용자의 최근 대화 100건 조회
    const { results } = await db.prepare(`
      SELECT role, content, created_at FROM conversations
      WHERE user_id = ? AND role IN ('user', 'assistant')
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(session.user_id).all();

    // 시간순 정렬 (오래된 것부터)
    const messages = (results || []).reverse();

    return Response.json({ messages });
  } catch (e) {
    return Response.json({ messages: [], error: e.message });
  }
}
