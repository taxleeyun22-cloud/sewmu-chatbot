// 예약 발송 — 관리자/스태프가 특정 시각에 자동 전송될 메시지를 예약
//
// GET  /api/admin-schedule?key=&room_id=           → 해당 방의 pending 예약 목록
// POST /api/admin-schedule?key=&action=create       body {room_id, content, scheduled_at (KST 'YYYY-MM-DD HH:MM:SS')}
// POST /api/admin-schedule?key=&action=cancel       body {id}
// POST /api/admin-schedule?key=&action=run_due      현재 시각보다 과거인 pending 을 실제 전송 → status='sent'
//
// 실행 트리거:
// - admin.js 가 5분 주기로 run_due 호출 (클라이언트 측 cron)
// - 관리자가 방 들어갈 때도 1회 호출
// - Cloudflare Pages 자체 cron 미지원 이슈 회피

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

function sanitizeDatetime(s) {
  const m = String(s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], se = +(m[6] || 0);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${String(se).padStart(2,'0')}`;
}

async function ensureTable(db) {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      sender_user_id INTEGER,
      content TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      created_at TEXT NOT NULL
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sched_pending ON scheduled_messages(status, scheduled_at)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sched_room ON scheduled_messages(room_id, status)`).run();
  } catch {}
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);
  const url = new URL(context.request.url);
  const roomId = (url.searchParams.get('room_id') || '').trim();
  if (!roomId) return Response.json({ error: 'room_id required' }, { status: 400 });
  if (!/^[A-Z0-9]{6,20}$/i.test(roomId)) return Response.json({ error: 'invalid room_id' }, { status: 400 });
  const { results } = await db.prepare(
    `SELECT id, room_id, sender_user_id, content, scheduled_at, status, sent_at, created_at
     FROM scheduled_messages WHERE room_id = ? AND status = 'pending' ORDER BY scheduled_at ASC`
  ).bind(roomId).all();
  return Response.json({ ok: true, items: results || [] });
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);
  const url = new URL(context.request.url);
  const action = (url.searchParams.get('action') || '').trim();
  let body = {};
  try { body = await context.request.json(); } catch {}
  const now = kst();

  if (action === 'create') {
    const roomId = String(body.room_id || '').trim();
    const content = String(body.content || '').trim();
    const sched = sanitizeDatetime(body.scheduled_at);
    if (!roomId || !/^[A-Z0-9]{6,20}$/i.test(roomId)) return Response.json({ error: 'invalid room_id' }, { status: 400 });
    if (!content) return Response.json({ error: 'content required' }, { status: 400 });
    if (content.length > 5000) return Response.json({ error: 'content too long' }, { status: 400 });
    if (!sched) return Response.json({ error: 'invalid scheduled_at (YYYY-MM-DD HH:MM:SS)' }, { status: 400 });
    if (sched <= now) return Response.json({ error: '예약 시각은 현재 시각 이후여야 합니다' }, { status: 400 });
    const r = await db.prepare(
      `INSERT INTO scheduled_messages (room_id, sender_user_id, content, scheduled_at, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    ).bind(roomId, auth.userId || null, content, sched, now).run();
    return Response.json({ ok: true, id: r.meta?.last_row_id || null });
  }

  if (action === 'cancel') {
    const id = parseInt(body.id, 10);
    if (!id || id < 1) return Response.json({ error: 'invalid id' }, { status: 400 });
    const row = await db.prepare(`SELECT status FROM scheduled_messages WHERE id = ?`).bind(id).first();
    if (!row) return Response.json({ error: 'not found' }, { status: 404 });
    if (row.status !== 'pending') return Response.json({ error: '이미 발송됐거나 취소된 항목' }, { status: 400 });
    await db.prepare(`UPDATE scheduled_messages SET status = 'cancelled' WHERE id = ?`).bind(id).run();
    return Response.json({ ok: true });
  }

  if (action === 'run_due') {
    const { results: due } = await db.prepare(
      `SELECT id, room_id, content, sender_user_id FROM scheduled_messages
       WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 50`
    ).bind(now).all();
    let sent = 0, failed = 0;
    for (const item of (due || [])) {
      try {
        await db.prepare(
          `INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
           VALUES (?, ?, 'human_advisor', ?, ?, ?)`
        ).bind('room_' + item.room_id, item.sender_user_id || null, item.content, item.room_id, now).run();
        await db.prepare(
          `UPDATE scheduled_messages SET status = 'sent', sent_at = ? WHERE id = ?`
        ).bind(now, item.id).run();
        /* 방 last_activity 갱신 */
        try { await db.prepare(`UPDATE chat_rooms SET last_activity_at = ? WHERE id = ?`).bind(now, item.room_id).run(); } catch {}
        sent++;
      } catch (e) {
        try { await db.prepare(`UPDATE scheduled_messages SET status = 'failed', sent_at = ? WHERE id = ?`).bind(now, item.id).run(); } catch {}
        failed++;
      }
    }
    return Response.json({ ok: true, sent, failed, checked: (due || []).length });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
