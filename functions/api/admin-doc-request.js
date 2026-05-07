// 사장님 명령 (2026-05-07): 거래처에게 서류 다시 업로드 요청
// POST /api/admin-doc-request { user_id, doc_label }
// - 그 사용자의 첫 active 상담방에 관리자 메시지 자동 전송
// - 거래처가 카톡/PWA 알림 받음 → 챗봇 들어가서 마이페이지에서 다시 업로드

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const userId = Number(body.user_id);
  const docLabel = String(body.doc_label || '서류').trim().slice(0, 50).replace(/[\r\n\t\x00-\x1f]/g, '');
  const customNote = String(body.note || '').trim().slice(0, 200).replace(/[\r\n\t\x00-\x1f]/g, '');

  if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

  try {
    /* 그 user 의 첫 active 상담방 (관리자방 제외) */
    const room = await db.prepare(`
      SELECT cr.id, cr.name FROM chat_rooms cr
      JOIN room_members rm ON rm.room_id = cr.id
      WHERE rm.user_id = ? AND (rm.left_at IS NULL OR rm.left_at = '')
        AND cr.status = 'active'
        AND COALESCE(cr.is_internal, 0) = 0
      ORDER BY cr.created_at DESC LIMIT 1
    `).bind(userId).first();

    if (!room) {
      return Response.json({ error: '거래처의 활성 상담방이 없습니다. 먼저 상담방을 만들어주세요.' }, { status: 404 });
    }

    const baseMsg = `🔔 [관리자 요청] ${docLabel} 다시 업로드 부탁드립니다.\n📲 마이페이지에서 업로드 가능합니다.`;
    const content = customNote ? `${baseMsg}\n\n💬 ${customNote}` : baseMsg;
    const now = kst();

    await db.prepare(`
      INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
      VALUES (NULL, ?, 'admin', ?, ?, ?)
    `).bind(auth.userId || null, content, room.id, now).run();

    return Response.json({ ok: true, room_id: room.id, room_name: room.name, message: content });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
