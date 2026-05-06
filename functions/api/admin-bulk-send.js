// 상담방 단체 발송 (관리자·스태프 전용)
// POST /api/admin-bulk-send
//   body: {
//     room_ids: [],
//     content: "메시지 본문",
//     attachments?: [{type:'image', url}, {type:'file', url, name, size}]
//   }
//   → 각 방에 human_advisor 메시지 insert + 웹푸시
//   → attachments 있으면 각 항목마다 별도 메시지로 순차 발송, 캡션(content)은 마지막 첨부에 붙임
//   → 결과: { ok, sent: N, failed: [room_id, ...] }
//
// 안전장치:
// - room_ids 최대 200개
// - content 5000자 제한
// - attachments 최대 10개
// - status='active' 방만 (closed 방 자동 skip)
// - image/file URL은 내부 프록시 경로만 (외부 URL 차단)
// - 각 방 insert 실패 시 나머지는 계속 진행, 실패 목록 반환

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";
import { checkRole, roleForbidden } from "./_authz.js";
import { notifyUser } from "./_webpush.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

/* 단체발송 1건의 메시지 content 문자열 생성 — [IMG]/[FILE] 프리픽스 통일.
   caption 이 있으면 해당 첨부의 첫 줄 다음에 붙임 */
function buildAttachmentContent(att, caption) {
  const t = att && att.type;
  if (t === 'image') {
    return caption ? `[IMG]${att.url}\n${caption}` : `[IMG]${att.url}`;
  }
  if (t === 'file') {
    const meta = JSON.stringify({ url: att.url, name: att.name || '파일', size: Number(att.size || 0) });
    return caption ? `[FILE]${meta}\n${caption}` : `[FILE]${meta}`;
  }
  return '';
}

function validAtt(att) {
  if (!att || typeof att !== 'object') return false;
  if (att.type === 'image') {
    return typeof att.url === 'string' && /^\/api\/image\?k=[A-Za-z0-9%._\-\/]+$/.test(att.url);
  }
  if (att.type === 'file') {
    if (typeof att.url !== 'string') return false;
    if (!/^\/api\/file\?k=[A-Za-z0-9%._\-\/]+(&name=[A-Za-z0-9%._\-]*)?$/.test(att.url)) return false;
    if (att.name && /[\r\n\t\\\/\x00-\x1f]/.test(String(att.name))) return false;
    if (att.size != null && (Number(att.size) < 0 || Number(att.size) > 500 * 1024 * 1024)) return false;
    return true;
  }
  return false;
}

export async function onRequestPost(context) {
  /* Phase #10 적용 (2026-05-06): 단체발송 = manager+ 전용.
   * 도배·정보 노출 위험. staff 직원은 단일 방 메시지만, 단체는 manager 권한 직원만. */
  const authz = await checkRole(context, 'manager');
  if (!authz.ok) return roleForbidden(authz);
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const ids = Array.isArray(body.room_ids) ? body.room_ids.filter(x => x && typeof x === 'string').slice(0, 200) : [];
  const content = String(body.content || '').trim();
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
  const attachments = rawAttachments.filter(validAtt);
  if (!ids.length) return Response.json({ error: "room_ids 필요 (최대 200)" }, { status: 400 });
  if (!content && !attachments.length) return Response.json({ error: "content 또는 attachments 필요" }, { status: 400 });
  if (content.length > 5000) return Response.json({ error: "메시지가 너무 깁니다 (5000자 제한)" }, { status: 400 });
  if (rawAttachments.length && !attachments.length) return Response.json({ error: "유효한 첨부가 없습니다 (내부 프록시 URL만 허용)" }, { status: 400 });

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

  /* 방마다 발송할 content 리스트 조립:
     - attachments 있으면 각 attachment 마다 1개 메시지, 마지막에만 caption 붙임
     - attachments 없으면 content 텍스트 1개
     - attachments + content 둘 다 있으면 마지막 attachment 에 content 가 캡션으로 */
  const msgPayloads = [];
  if (attachments.length) {
    for (let i = 0; i < attachments.length; i++) {
      const isLast = i === attachments.length - 1;
      msgPayloads.push(buildAttachmentContent(attachments[i], isLast ? content : ''));
    }
  } else {
    msgPayloads.push(content);
  }

  let sent = 0;
  const failed = [];
  for (const rm of targets) {
    try {
      for (const msg of msgPayloads) {
        await db.prepare(
          `INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
           VALUES (?, ?, 'human_advisor', ?, ?, ?)`
        ).bind('room_' + rm.id, actorUid, msg, rm.id, now).run();
      }
      /* 본인 last_read_at 갱신 */
      if (actorUid) {
        try {
          await db.prepare(
            `UPDATE room_members SET last_read_at = ? WHERE room_id = ? AND user_id = ?`
          ).bind(now, rm.id, actorUid).run();
        } catch {}
      }
      /* 웹푸시 — 방 멤버 중 관리자 제외한 고객에게 (메시지 1건분만 요약 알림) */
      try {
        const { results: members } = await db.prepare(
          `SELECT user_id, role FROM room_members
           WHERE room_id = ? AND left_at IS NULL AND user_id IS NOT NULL`
        ).bind(rm.id).all();
        let notifyBody;
        if (attachments.length) {
          const kind = attachments[0].type === 'image' ? '📷 사진' : '📁 파일';
          notifyBody = (attachments.length > 1 ? kind + ' ' + attachments.length + '개' : kind) + (content ? ' · ' + content.slice(0, 60) : '');
        } else {
          notifyBody = content.slice(0, 80);
        }
        for (const m of (members || [])) {
          if (m.role === 'admin') continue;
          await notifyUser(db, context.env, m.user_id, {
            title: '💬 ' + (rm.name || '상담방'),
            body: '세무사: ' + notifyBody,
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

  return Response.json({ ok: true, sent, failed, total_targets: targets.length, attachments_per_room: msgPayloads.length });
}
