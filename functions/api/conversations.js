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

    // user_id가 있으면 user_id로 묶고, 없으면 session_id로 표시
    const { results } = await db.prepare(`
      SELECT
        CASE WHEN user_id IS NOT NULL THEN CAST(user_id AS TEXT) ELSE session_id END as group_id,
        user_id,
        MIN(created_at) as started_at,
        MAX(created_at) as last_at,
        COUNT(*) as message_count
      FROM conversations
      GROUP BY CASE WHEN user_id IS NOT NULL THEN CAST(user_id AS TEXT) ELSE session_id END
      ORDER BY MAX(created_at) DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    // users 테이블에서 사용자 정보 추가
    for (const s of results) {
      if (s.user_id) {
        try {
          const u = await db.prepare(`SELECT name, email, provider, profile_image FROM users WHERE id = ?`).bind(s.user_id).first();
          if (u) {
            s.user_name = u.name;
            s.user_email = u.email;
            s.user_provider = u.provider;
            s.user_profile_image = u.profile_image;
          }
        } catch {}
      }
    }

    const countResult = await db.prepare(
      `SELECT COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN CAST(user_id AS TEXT) ELSE session_id END) as total FROM conversations`
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
