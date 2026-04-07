export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const adminKey = context.env.ADMIN_KEY;

  if (!adminKey || key !== adminKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = context.env.DB;
  if (!db) {
    return Response.json({ error: "DB not configured" }, { status: 500 });
  }

  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return Response.json({ error: "session parameter required" }, { status: 400 });
  }

  try {
    const { results } = await db.prepare(`
      SELECT id, session_id, role, content, created_at
      FROM conversations
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).bind(sessionId).all();

    return Response.json({ messages: results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
