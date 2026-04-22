// 상담방 단체 발송 (관리자·스태프 전용)
// POST /api/admin-bulk-send
//   body: { room_ids: [], content: "메시지 본문" }
//   → 각 방에 human_advisor 메시지 insert + 웹푸시
//   → 결과: { ok, sent: N, failed: [room_id, ...] }
//
// 안전장치:
// - room_ids 최대 200개 (한번에 너무 많이 전송 방지)
// - content 5000자 제한
// - status='active' 방만 (closed 방 자동 skip)
// - 각 방 insert 실패 시 나머지는 계속 진행, 실패 목록 반환

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";
import { notifyUser } from "./_webpush.js";

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

  const ids = Array.isArray(body.room_ids) ? body.room_ids.filter(x => x && typeof x === 'string').slice(0, 200) : [];
  const content = String(body.content || '').trim();
  if (!ids.length) return Response.json({ error: "room_ids 필요 (최대 200)" }, { status: 400 });
  if (!content) return Response.json({ error: "content 필요" }, { status: 400 });
  if (content.length > 5000) return Response.json({ error: "메시지가 너무 깁니다 (5000자 제한)" }, { status: 400 });

  const now = kst();
  const actorUid = auth.userId || null;

  /* 실제 대상 방 — active 만 */
  const placeholders = ids.map(() => '?').join(',');
  let targets = [];
  try {
    const { results } = await db.prepare(
      `SELECT id, name, status FROM chat_rooms WHERE id IN (${placeholders})`
    ).bind(...ids).all();
    targets = (results || []).filter(r => r.status === 'active');
  } catch (e) {
    return Response.json({ error: "방 조회 실패: " + e.message }, { status: 500 });
  }
  if (!targets.length) return Response.json({ error: "발송 가능한 active 방이 없습니다" }, { status: 400 });

  let sent = 0;
  const failed = [];
  for (const rm of targets) {
    try {
      /* 메시지 insert */
      await db.prepare(
        `INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
         VALUES (?, ?, 'human_advisor', ?, ?, ?)`
      ).bind('room_' + rm.id, actorUid, content, rm.id, now).run();
      /* 본인 last_read_at 갱신 */
      if (actorUid) {
        try {
          await db.prepare(
            `UPDATE room_members SET last_read_at = ? WHERE room_id = ? AND user_id = ?`
          ).bind(now, rm.id, actorUid).run();
        } catch {}
      }
      /* 웹푸시 — 방 멤버 중 관리자 제외한 고객에게 */
      try {
        const { results: members } = await db.prepare(
          `SELECT user_id, role FROM room_members
           WHERE room_id = ? AND left_at IS NULL AND user_id IS NOT NULL`
        ).bind(rm.id).all();
        const bodyText = content.slice(0, 80);
        for (const m of (members || [])) {
          if (m.role === 'admin') continue; /* 관리자 본인 알림 X */
          await notifyUser(db, context.env, m.user_id, {
            title: '💬 ' + (rm.name || '상담방'),
            body: '세무사: ' + bodyText,
            tag: 'room-' + rm.id,
            url: '/?room=' + rm.id,
          });
        }
      } catch { /* push 실패는 계속 진행 */ }
      sent++;
    } catch (e) {
      failed.push({ room_id: rm.id, error: e.message });
    }
  }

  return Response.json({ ok: true, sent, failed, total_targets: targets.length });
}
