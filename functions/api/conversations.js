import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const url = new URL(context.request.url);
  const db = context.env.DB;
  if (!db) {
    return Response.json({ error: "DB not configured" }, { status: 500 });
  }

  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = (url.searchParams.get("search") || "").trim();
  const confidence = url.searchParams.get("confidence") || ""; // 높음/보통/낮음
  const provider = url.searchParams.get("provider") || ""; // kakao/naver

  try {
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN user_id INTEGER`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN confidence TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reviewed INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reported INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN room_id TEXT`).run(); } catch {}

    await db.prepare(`CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence TEXT,
      reviewed INTEGER DEFAULT 0,
      reported INTEGER DEFAULT 0,
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

    // 세션 그룹화 (user_id 또는 session_id)
    // 상담방(room_id 있는) 메시지는 별도 탭에서 조회하므로 여기서 제외
    let filterCondition = "";
    const params = [];
    if (confidence) {
      filterCondition += ` AND EXISTS (SELECT 1 FROM conversations c2 WHERE c2.session_id = conversations.session_id AND (c2.room_id IS NULL OR c2.room_id = '') AND c2.confidence = ?)`;
      params.push(confidence);
    }
    if (search) {
      filterCondition += ` AND EXISTS (SELECT 1 FROM conversations c3 WHERE c3.session_id = conversations.session_id AND (c3.room_id IS NULL OR c3.room_id = '') AND c3.content LIKE ?)`;
      params.push(`%${search}%`);
    }

    let providerFilter = "";
    if (provider) {
      providerFilter = ` AND user_id IN (SELECT id FROM users WHERE provider = ?)`;
      params.push(provider);
    }

    const query = `
      SELECT
        CASE WHEN user_id IS NOT NULL THEN CAST(user_id AS TEXT) ELSE session_id END as group_id,
        user_id,
        MIN(created_at) as started_at,
        MAX(created_at) as last_at,
        COUNT(*) as message_count,
        SUM(CASE WHEN confidence = '높음' THEN 1 ELSE 0 END) as count_high,
        SUM(CASE WHEN confidence = '보통' THEN 1 ELSE 0 END) as count_medium,
        SUM(CASE WHEN confidence = '낮음' THEN 1 ELSE 0 END) as count_low,
        SUM(CASE WHEN reported = 1 THEN 1 ELSE 0 END) as count_reported
      FROM conversations
      WHERE (room_id IS NULL OR room_id = '') ${filterCondition} ${providerFilter}
      GROUP BY CASE WHEN user_id IS NOT NULL THEN CAST(user_id AS TEXT) ELSE session_id END
      ORDER BY MAX(created_at) DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const { results } = await db.prepare(query).bind(...params).all();

    for (const s of results) {
      if (s.user_id) {
        try {
          const u = await db.prepare(`SELECT name, email, phone, provider, profile_image FROM users WHERE id = ?`).bind(s.user_id).first();
          if (u) {
            s.user_name = u.name;
            s.user_email = u.email;
            s.user_phone = u.phone;
            s.user_provider = u.provider;
            s.user_profile_image = u.profile_image;
          }
        } catch {}
      }
    }

    const countResult = await db.prepare(
      `SELECT COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN CAST(user_id AS TEXT) ELSE session_id END) as total FROM conversations WHERE (room_id IS NULL OR room_id = '')`
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
