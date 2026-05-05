/**
 * Phase M11 (2026-05-05 사장님 명령): 1 상담방 ↔ N 업체 N:N 매핑
 *
 * 사장님 직접 인용:
 * > "이 상담방에 연결된 업체 기준으로 해야된다."
 * > "한 상담방에 업체가 몇개 사업체가 들어갈수있음 알지?"
 *
 * room_businesses 테이블 — 1 상담방 = N 업체 (양방향 N:N).
 * 기존 chat_rooms.business_id 단일 컬럼 → 호환 유지 (is_primary=1 의 alias).
 *
 * Endpoints:
 *   GET    /api/admin-room-businesses?room_id=X        → 그 방에 연결된 업체 list
 *   POST   /api/admin-room-businesses                  → 연결 (UPSERT)
 *                body: { room_id, business_id, is_primary?, set_chat_rooms_business_id? }
 *   DELETE /api/admin-room-businesses?room_id=X&business_id=N → 매핑 해제 (soft)
 */

import { checkAdmin } from './_adminAuth.js';

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS room_businesses (
    room_id TEXT NOT NULL,
    business_id INTEGER NOT NULL,
    is_primary INTEGER DEFAULT 0,
    linked_at TEXT,
    linked_by_user_id INTEGER,
    removed_at TEXT,
    PRIMARY KEY (room_id, business_id)
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_room_businesses_room ON room_businesses(room_id)`).run(); } catch (_) {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_room_businesses_biz ON room_businesses(business_id)`).run(); } catch (_) {}

  /* lazy migration: chat_rooms.business_id != NULL 인 방 → room_businesses 자동 매핑 */
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO room_businesses (room_id, business_id, is_primary, linked_at)
      SELECT id, business_id, 1, COALESCE(updated_at, created_at, datetime('now'))
      FROM chat_rooms
      WHERE business_id IS NOT NULL
    `).run();
  } catch (_) {}
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return Response.json({ error: 'unauth' }, { status: 401 });

  const db = context.env.DB || context.env.db;
  if (!db) return Response.json({ error: 'DB binding missing' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const roomId = url.searchParams.get('room_id');
  if (!roomId) return Response.json({ error: 'room_id required' }, { status: 400 });

  try {
    const { results } = await db.prepare(`
      SELECT rb.business_id, rb.is_primary, rb.linked_at,
             b.company_name, b.business_number, b.ceo_name, b.industry,
             b.tax_type, b.business_category, b.industry_code, b.address, b.phone, b.status
      FROM room_businesses rb
      LEFT JOIN businesses b ON rb.business_id = b.id
      WHERE rb.room_id = ?
        AND (rb.removed_at IS NULL OR rb.removed_at = '')
        AND (b.deleted_at IS NULL OR b.deleted_at = '')
      ORDER BY rb.is_primary DESC, rb.linked_at ASC
    `).bind(roomId).all();

    const businesses = (results || []).map(r => ({
      id: r.business_id,
      company_name: r.company_name,
      business_number: r.business_number,
      ceo_name: r.ceo_name,
      industry: r.industry,
      tax_type: r.tax_type,
      business_category: r.business_category,
      industry_code: r.industry_code,
      address: r.address,
      phone: r.phone,
      status: r.status,
      is_primary: !!r.is_primary,
      linked_at: r.linked_at,
    }));
    return Response.json({ ok: true, businesses, total: businesses.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return Response.json({ error: 'unauth' }, { status: 401 });

  const db = context.env.DB || context.env.db;
  if (!db) return Response.json({ error: 'DB binding missing' }, { status: 500 });
  await ensureTable(db);

  let body;
  try { body = await context.request.json(); } catch (_) { return Response.json({ error: 'JSON body 필요' }, { status: 400 }); }

  const roomId = String(body.room_id || '').trim();
  const bizId = Number(body.business_id || 0);
  const isPrimary = body.is_primary ? 1 : 0;
  const setChatRoomsBizId = body.set_chat_rooms_business_id !== false; /* default true (호환) */

  if (!roomId || !bizId) return Response.json({ error: 'room_id, business_id 필요' }, { status: 400 });

  try {
    /* room 존재 확인 */
    const room = await db.prepare(`SELECT id FROM chat_rooms WHERE id = ?`).bind(roomId).first();
    if (!room) return Response.json({ error: 'room not found' }, { status: 404 });

    /* business 존재 확인 (deleted_at 체크) */
    const biz = await db.prepare(`SELECT id, company_name FROM businesses WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')`).bind(bizId).first();
    if (!biz) return Response.json({ error: 'business not found or deleted' }, { status: 404 });

    const now = kst();
    const adminUid = (auth && auth.userId) ? Number(auth.userId) : 1;

    /* primary=1 이면 같은 방의 다른 매핑 모두 0 */
    if (isPrimary) {
      await db.prepare(`UPDATE room_businesses SET is_primary = 0 WHERE room_id = ? AND business_id != ?`).bind(roomId, bizId).run();
    }

    /* UPSERT — 기존 removed_at 도 NULL 로 복구 */
    await db.prepare(`
      INSERT INTO room_businesses (room_id, business_id, is_primary, linked_at, linked_by_user_id, removed_at)
      VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT(room_id, business_id) DO UPDATE SET
        is_primary = excluded.is_primary,
        removed_at = NULL,
        linked_at = COALESCE(room_businesses.linked_at, excluded.linked_at)
    `).bind(roomId, bizId, isPrimary, now, adminUid).run();

    /* 호환: chat_rooms.business_id 도 갱신 (primary 인 경우 또는 setChatRoomsBizId=true 인 경우) */
    if (setChatRoomsBizId && isPrimary) {
      try { await db.prepare(`UPDATE chat_rooms SET business_id = ? WHERE id = ?`).bind(bizId, roomId).run(); } catch (_) {}
    }

    return Response.json({
      ok: true,
      room_id: roomId,
      business_id: bizId,
      business_name: biz.company_name,
      is_primary: !!isPrimary,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return Response.json({ error: 'unauth' }, { status: 401 });

  const db = context.env.DB || context.env.db;
  if (!db) return Response.json({ error: 'DB binding missing' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const roomId = url.searchParams.get('room_id');
  const bizId = Number(url.searchParams.get('business_id') || 0);
  if (!roomId || !bizId) return Response.json({ error: 'room_id, business_id 필요' }, { status: 400 });

  try {
    const now = kst();
    /* soft delete */
    const r = await db.prepare(`
      UPDATE room_businesses SET removed_at = ?
      WHERE room_id = ? AND business_id = ? AND (removed_at IS NULL OR removed_at = '')
    `).bind(now, roomId, bizId).run();

    /* chat_rooms.business_id 가 이거였으면 NULL or 다른 primary 로 */
    try {
      const room = await db.prepare(`SELECT business_id FROM chat_rooms WHERE id = ?`).bind(roomId).first();
      if (room && Number(room.business_id) === bizId) {
        /* 다른 active 매핑 중 primary 또는 첫 번째로 */
        const next = await db.prepare(`
          SELECT business_id FROM room_businesses
          WHERE room_id = ? AND (removed_at IS NULL OR removed_at = '')
          ORDER BY is_primary DESC, linked_at ASC LIMIT 1
        `).bind(roomId).first();
        const newBizId = next ? next.business_id : null;
        await db.prepare(`UPDATE chat_rooms SET business_id = ? WHERE id = ?`).bind(newBizId, roomId).run();
      }
    } catch (_) {}

    return Response.json({ ok: true, removed: r && r.meta ? (r.meta.changes || 0) : 0 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
