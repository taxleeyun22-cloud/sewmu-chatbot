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

  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const { results } = await db.prepare(`
      SELECT
        session_id,
        MIN(created_at) as started_at,
        COUNT(*) as message_count
      FROM conversations
      GROUP BY session_id
      ORDER BY MAX(created_at) DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const countResult = await db.prepare(`
      SELECT COUNT(DISTINCT session_id) as total FROM conversations
    `).first();

    return Response.json({
      sessions: results,
      total: countResult.total,
      page,
      totalPages: Math.ceil(countResult.total / limit)
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
