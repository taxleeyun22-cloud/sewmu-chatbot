// 관리자 - 특정 세션 대화 상세 조회
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const adminKey = url.searchParams.get("key");

  if (adminKey !== context.env.ADMIN_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  const sessionId = url.searchParams.get("session");
  if (!sessionId) return Response.json({ error: "session required" }, { status: 400 });

  try {
    const messages = await db.prepare(
      "SELECT role, content, created_at FROM conversations WHERE session_id = ? ORDER BY created_at ASC"
    ).bind(sessionId).all();

    return Response.json({ messages: messages.results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
