// 칼럼 CRUD API
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT DEFAULT '',
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const article = await db.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
      return Response.json(article || { error: "Not found" });
    }

    const articles = await db.prepare(
      "SELECT id, title, category, created_at FROM articles ORDER BY created_at DESC"
    ).all();
    return Response.json({ articles: articles.results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const adminKey = url.searchParams.get("key");
  if (adminKey !== context.env.ADMIN_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  try {
    const { title, category, content, id } = await context.request.json();

    if (id) {
      await db.prepare(
        "UPDATE articles SET title=?, category=?, content=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(title, category || "", content, id).run();
      return Response.json({ ok: true, id });
    }

    const result = await db.prepare(
      "INSERT INTO articles (title, category, content) VALUES (?, ?, ?)"
    ).bind(title, category || "", content).run();
    return Response.json({ ok: true, id: result.meta?.last_row_id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
