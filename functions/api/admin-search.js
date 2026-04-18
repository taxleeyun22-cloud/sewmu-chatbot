// 관리자 전역 검색
// GET /api/admin-search?q=XXX
// 반환: { users, conversations, rooms, room_messages } 각 최대 10건
import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

export async function onRequestGet(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q || q.length < 2) {
    return Response.json({ users: [], conversations: [], rooms: [], room_messages: [], query: q });
  }

  const pat = `%${q}%`;

  try {
    // 1) 사용자 (이름/본명/이메일/전화)
    const usersR = await db.prepare(`
      SELECT id, provider, name, real_name, email, phone, profile_image,
             approval_status, is_admin, created_at, last_login_at
      FROM users
      WHERE name LIKE ? OR real_name LIKE ? OR email LIKE ? OR phone LIKE ?
      ORDER BY last_login_at DESC
      LIMIT 10
    `).bind(pat, pat, pat, pat).all();

    // 2) 일반 대화 (방 외부)
    const convsR = await db.prepare(`
      SELECT c.id, c.session_id, c.user_id, c.role, c.content, c.created_at, c.confidence,
             u.real_name, u.name
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.content LIKE ? AND (c.room_id IS NULL OR c.room_id = '')
      ORDER BY c.created_at DESC
      LIMIT 10
    `).bind(pat).all();

    // 3) 상담방 (방 이름)
    let roomsR = { results: [] };
    try {
      roomsR = await db.prepare(`
        SELECT id, name, status, created_at,
               (SELECT COUNT(*) FROM conversations WHERE room_id = r.id) as msg_count
        FROM chat_rooms r
        WHERE name LIKE ?
        ORDER BY created_at DESC
        LIMIT 10
      `).bind(pat).all();
    } catch {}

    // 4) 상담방 메시지
    let roomMsgsR = { results: [] };
    try {
      roomMsgsR = await db.prepare(`
        SELECT c.id, c.room_id, c.role, c.content, c.created_at,
               u.real_name, u.name,
               r.name as room_name
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN chat_rooms r ON c.room_id = r.id
        WHERE c.content LIKE ? AND c.room_id IS NOT NULL AND c.room_id != ''
        ORDER BY c.created_at DESC
        LIMIT 10
      `).bind(pat).all();
    } catch {}

    return Response.json({
      query: q,
      users: usersR.results || [],
      conversations: convsR.results || [],
      rooms: roomsR.results || [],
      room_messages: roomMsgsR.results || [],
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
