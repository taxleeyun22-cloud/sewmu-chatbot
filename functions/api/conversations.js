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
    // users 테이블이 없을 수도 있으니 안전하게 처리
    const { results } = await db.prepare(`
      SELECT
        c.session_id,
        MIN(c.created_at) as started_at,
        COUNT(*) as message_count,
        c.user_id,
        u.name as user_name,
        u.phone as user_phone,
        u.email as user_email,
        u.provider as user_provider,
        u.profile_image as user_profile_image
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      GROUP BY c.session_id
      ORDER BY MAX(c.created_at) DESC
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
