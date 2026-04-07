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
    // 테이블 재생성 (user_id 컬럼 추가)
    try {
      await db.prepare(`ALTER TABLE conversations ADD COLUMN user_id INTEGER`).run();
    } catch {}

    await db.prepare(`CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();

    await db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      profile_image TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT DEFAULT (datetime('now')),
      UNIQUE(provider, provider_id)
    )`).run();

    // user_id 기준으로 묶어서 표시 (같은 사용자는 하나로)
    const { results } = await db.prepare(`
      SELECT
        COALESCE(c.user_id, c.session_id) as group_id,
        c.user_id,
        MIN(c.created_at) as started_at,
        MAX(c.created_at) as last_at,
        COUNT(*) as message_count,
        u.name as user_name,
        u.email as user_email,
        u.provider as user_provider,
        u.profile_image as user_profile_image
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      GROUP BY COALESCE(c.user_id, c.session_id)
      ORDER BY MAX(c.created_at) DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const countResult = await db.prepare(
      `SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) as total FROM conversations`
    ).first();

    return Response.json({
      sessions: results,
      total: countResult?.total || 0,
      page,
      totalPages: Math.ceil((countResult?.total || 0) / limit)
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
