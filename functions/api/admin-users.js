// 관리자 사용자 리스트
import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();

  const url = new URL(context.request.url);
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  // is_admin 컬럼 보장
  try { await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run(); } catch {}

  const search = (url.searchParams.get("search") || "").trim();
  const sort = url.searchParams.get("sort") || "recent"; // recent/joined/messages
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 30;
  const offset = (page - 1) * limit;

  try {
    let whereClause = "1=1";
    const params = [];
    if (search) {
      whereClause += " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    let orderBy = "u.last_login_at DESC";
    if (sort === "joined") orderBy = "u.created_at DESC";
    if (sort === "messages") orderBy = "message_count DESC";

    const query = `
      SELECT
        u.id, u.provider, u.name, u.email, u.phone, u.profile_image, u.is_admin,
        u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) as message_count,
        (SELECT MAX(created_at) FROM conversations c WHERE c.user_id = u.id) as last_message_at
      FROM users u
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const { results } = await db.prepare(query).bind(...params).all();
    const countR = await db.prepare(`SELECT COUNT(*) as n FROM users`).first();

    return Response.json({
      users: results || [],
      total: countR?.n || 0,
      page,
      totalPages: Math.ceil((countR?.n || 0) / limit),
      caller_owner: !!auth.owner,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin-users?action=set_admin { user_id, is_admin: 0|1 }
// 사장님(owner)만 다른 사용자의 is_admin 플래그를 변경할 수 있음
export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return Response.json({ error: "owner 권한 필요 (직원 관리자는 다른 관리자를 승인할 수 없습니다)" }, { status: 403 });

  const url = new URL(context.request.url);
  const action = url.searchParams.get("action");
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  try { await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run(); } catch {}

  let body = {};
  try { body = await context.request.json(); } catch {}

  if (action === "set_admin") {
    const userId = Number(body.user_id);
    const isAdmin = body.is_admin === 1 || body.is_admin === true ? 1 : 0;
    if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
    try {
      await db.prepare(`UPDATE users SET is_admin = ? WHERE id = ?`).bind(isAdmin, userId).run();
      return Response.json({ ok: true, user_id: userId, is_admin: isAdmin });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
