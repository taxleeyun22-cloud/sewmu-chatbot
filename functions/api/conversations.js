// 관리자 - 대화 내역 조회 API
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const adminKey = url.searchParams.get("key");

  if (adminKey !== context.env.ADMIN_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const total = await db.prepare("SELECT COUNT(DISTINCT session_id) as cnt FROM conversations").first();
    const sessions = await db.prepare(`
      SELECT session_id,
             MIN(created_at) as started_at,
             MAX(created_at) as last_at,
             COUNT(*) as msg_count
      FROM conversations
      GROUP BY session_id
      ORDER BY MAX(created_at) DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return Response.json({
      total: total?.cnt || 0,
      page,
      sessions: sessions.results || [],
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
