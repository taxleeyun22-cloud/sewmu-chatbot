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

  /* @멘션용 간이 스태프 리스트 — is_admin=1 만 반환 (id, name) */
  const action = url.searchParams.get("action");
  if (action === "staff_list") {
    try {
      const { results } = await db.prepare(
        `SELECT id, COALESCE(real_name, name, 'ID#'||id) AS display_name, is_admin
         FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 50`
      ).all();
      return Response.json({ ok: true, staff: results || [] });
    } catch (e) {
      return Response.json({ ok: true, staff: [] });
    }
  }

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
      /* 승급(1)이면 기존 활성 방 전체에 자동 참여 — 카톡 그룹방 스타일 통일.
         강등(0)이면 강제 참여로 'admin' 박혔던 멤버십을 'member' 로 환원 —
         my-rooms.js '내 상담방' 필터에 막혀 기장거래처 전환 후 빈 화면 나는 버그 방지. */
      let addedRooms = 0;
      let demotedMemberships = 0;
      if (isAdmin === 0) {
        try {
          const r = await db.prepare(
            `UPDATE room_members SET role = 'member'
             WHERE user_id = ? AND role = 'admin' AND left_at IS NULL`
          ).bind(userId).run();
          demotedMemberships = r?.meta?.changes || 0;
        } catch {}
      }
      if (isAdmin === 1) {
        try {
          const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
          const { results: rooms } = await db.prepare(
            `SELECT id FROM chat_rooms WHERE status = 'active'`
          ).all();
          for (const r of (rooms || [])) {
            try {
              const existing = await db.prepare(
                `SELECT user_id, left_at FROM room_members WHERE room_id = ? AND user_id = ?`
              ).bind(r.id, userId).first();
              if (existing) {
                if (existing.left_at) {
                  await db.prepare(
                    `UPDATE room_members SET role = 'admin', left_at = NULL WHERE room_id = ? AND user_id = ?`
                  ).bind(r.id, userId).run();
                  addedRooms++;
                } else {
                  /* 이미 참여 중이면 역할만 admin 으로 승격 */
                  await db.prepare(
                    `UPDATE room_members SET role = 'admin' WHERE room_id = ? AND user_id = ?`
                  ).bind(r.id, userId).run();
                }
              } else {
                await db.prepare(
                  `INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)`
                ).bind(r.id, userId, now).run();
                addedRooms++;
              }
            } catch { /* 방별 실패는 계속 진행 */ }
          }
        } catch {}
      }
      return Response.json({ ok: true, user_id: userId, is_admin: isAdmin, added_rooms: addedRooms, demoted_memberships: demotedMemberships });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
