import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

export async function onRequestGet(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();

  const url = new URL(context.request.url);
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  const groupId = url.searchParams.get("session");
  if (!groupId) return Response.json({ error: "session parameter required" }, { status: 400 });

  try {
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN room_id TEXT`).run(); } catch {}

    // user_id 또는 session_id로 조회 (숫자면 user_id, 아니면 session_id)
    // 상담방 메시지(room_id 있음)는 제외 — 상담방 탭에서 별도 조회
    let results;
    if (/^\d+$/.test(groupId)) {
      const r = await db.prepare(`
        SELECT id, session_id, user_id, role, content, created_at
        FROM conversations
        WHERE user_id = ? AND (room_id IS NULL OR room_id = '')
        ORDER BY created_at ASC
      `).bind(parseInt(groupId)).all();
      results = r.results;
    } else {
      const r = await db.prepare(`
        SELECT id, session_id, user_id, role, content, created_at
        FROM conversations
        WHERE session_id = ? AND (room_id IS NULL OR room_id = '')
        ORDER BY created_at ASC
      `).bind(groupId).all();
      results = r.results;
    }

    return Response.json({ messages: results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
