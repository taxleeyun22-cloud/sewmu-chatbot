// 🚫 거래 종료 승인 요청 큐 (직원이 요청 → 대표가 승인)
//
// GET  /api/admin-termination-requests?key=&status=pending  → 대기 요청 목록 (owner/staff 모두 조회 가능)
// POST /api/admin-termination-requests?key=&action=approve  body {id, note?} → 실제 terminated 실행 (owner 전용)
// POST /api/admin-termination-requests?key=&action=reject   body {id, note?} → 요청 반려 (owner 전용)
// POST /api/admin-termination-requests?key=&action=cancel   body {id} → 요청자 본인 취소 (직원 자신 요청만)

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS termination_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    requested_by INTEGER,
    requested_by_name TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    requested_at TEXT NOT NULL,
    reviewed_by INTEGER,
    reviewed_at TEXT,
    review_note TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_term_status ON termination_requests(status, requested_at DESC)`).run(); } catch {}
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);
  const url = new URL(context.request.url);
  const status = url.searchParams.get('status') || 'pending';
  try {
    const { results } = await db.prepare(
      `SELECT tr.*, u.real_name, u.name, u.phone, u.approval_status
         FROM termination_requests tr
         LEFT JOIN users u ON tr.user_id = u.id
        WHERE tr.status = ?
        ORDER BY tr.requested_at DESC LIMIT 100`
    ).bind(status).all();
    /* pending count 도 같이 */
    const countRow = await db.prepare(`SELECT COUNT(*) AS c FROM termination_requests WHERE status = 'pending'`).first();
    return Response.json({ ok: true, items: results || [], pending_count: countRow?.c || 0 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
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
  const id = Number(body.id);
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
  const note = String(body.note || '').trim().slice(0, 500) || null;

  const row = await db.prepare(`SELECT * FROM termination_requests WHERE id = ?`).bind(id).first();
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  if (row.status !== 'pending') return Response.json({ error: '이미 처리된 요청 (' + row.status + ')' }, { status: 400 });

  const now = kst();

  if (action === 'cancel') {
    /* 직원 본인만 취소 가능 (or owner) */
    if (!auth.owner && auth.userId !== row.requested_by) {
      return Response.json({ error: '본인 요청만 취소할 수 있습니다' }, { status: 403 });
    }
    await db.prepare(
      `UPDATE termination_requests SET status = 'cancelled', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`
    ).bind(auth.userId || null, now, note, id).run();
    return Response.json({ ok: true });
  }

  if (action === 'reject') {
    if (!auth.owner) return ownerOnly();
    await db.prepare(
      `UPDATE termination_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`
    ).bind(auth.userId || null, now, note, id).run();
    return Response.json({ ok: true });
  }

  if (action === 'approve') {
    if (!auth.owner) return ownerOnly();
    const userId = row.user_id;
    try {
      /* 1. users.approval_status = 'terminated' */
      await db.prepare(
        `UPDATE users SET approval_status = 'terminated', approved_at = ?, approved_by = 'owner', rejection_reason = ? WHERE id = ?`
      ).bind(now, row.reason || note || null, userId).run();
      /* 2. 해당 사용자가 속한 active 방 모두 closed + left_at */
      const { results: rooms } = await db.prepare(
        `SELECT rm.room_id FROM room_members rm
         JOIN chat_rooms r ON rm.room_id = r.id
         WHERE rm.user_id = ? AND rm.left_at IS NULL AND r.status = 'active'`
      ).bind(userId).all();
      for (const rm of (rooms || [])) {
        try {
          await db.prepare(`UPDATE chat_rooms SET status = 'closed' WHERE id = ?`).bind(rm.room_id).run();
          await db.prepare(`UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?`).bind(now, rm.room_id, userId).run();
        } catch {}
      }
      /* 3. 요청 상태 업데이트 */
      await db.prepare(
        `UPDATE termination_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`
      ).bind(auth.userId || null, now, note, id).run();
      /* 4. 감사 로그 */
      try {
        await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT, entity_type TEXT, entity_id INTEGER,
          before TEXT, after TEXT, created_at TEXT DEFAULT (datetime('now', '+9 hours'))
        )`).run();
        await db.prepare(
          `INSERT INTO audit_log (actor, action, entity_type, entity_id, before, after)
           VALUES (?, 'termination_approved', 'user', ?, ?, ?)`
        ).bind('owner', userId, JSON.stringify({ request_by: row.requested_by_name, reason: row.reason }), JSON.stringify({ status: 'terminated', rooms_closed: (rooms || []).length })).run();
      } catch {}
      return Response.json({ ok: true, terminated_rooms: (rooms || []).length });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
