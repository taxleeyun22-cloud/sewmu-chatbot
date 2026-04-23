// 메시지 북마크 (⭐ 즐겨찾기) — 관리자/스태프가 중요 메시지를 방별로 저장
//
// POST /api/admin-bookmark?key=&action=add     body {room_id, message_id, note?}
// POST /api/admin-bookmark?key=&action=remove  body {message_id}
// GET  /api/admin-bookmark?key=&room_id=       → 해당 방의 북마크 목록 + 원본 메시지
// GET  /api/admin-bookmark?key=                → 내 전체 북마크
//
// auth.userId 없으면(owner/ADMIN_KEY 로그인) 특별 user_id=0 으로 공유 북마크 저장

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS message_bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      room_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, message_id)
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_bookmark_room ON message_bookmarks(room_id, user_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_bookmark_user ON message_bookmarks(user_id, created_at DESC)`).run();
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
  const uid = auth.userId || 0;

  if (roomId) {
    if (!/^[A-Z0-9]{6,20}$/i.test(roomId)) return Response.json({ error: 'invalid room_id' }, { status: 400 });
    const { results } = await db.prepare(
      `SELECT b.id, b.message_id, b.note, b.created_at AS bookmarked_at,
              c.role, c.content, c.created_at, c.user_id,
              u.real_name, u.name
       FROM message_bookmarks b
       LEFT JOIN conversations c ON b.message_id = c.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE b.user_id = ? AND b.room_id = ?
       ORDER BY b.created_at DESC`
    ).bind(uid, roomId).all();
    return Response.json({ ok: true, items: results || [] });
  }

  /* 전체 내 북마크 */
  const { results } = await db.prepare(
    `SELECT b.id, b.message_id, b.room_id, b.note, b.created_at AS bookmarked_at,
            c.role, c.content, c.created_at
     FROM message_bookmarks b
     LEFT JOIN conversations c ON b.message_id = c.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC
     LIMIT 200`
  ).bind(uid).all();
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
  const uid = auth.userId || 0;
  const now = kst();
  let body = {};
  try { body = await context.request.json(); } catch {}

  if (action === 'add') {
    const roomId = String(body.room_id || '').trim();
    const messageId = parseInt(body.message_id, 10);
    const note = String(body.note || '').trim().slice(0, 500);
    if (!roomId || !/^[A-Z0-9]{6,20}$/i.test(roomId)) return Response.json({ error: 'invalid room_id' }, { status: 400 });
    if (!messageId || messageId < 1) return Response.json({ error: 'invalid message_id' }, { status: 400 });
    try {
      await db.prepare(
        `INSERT INTO message_bookmarks (user_id, room_id, message_id, note, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, message_id) DO UPDATE SET note = excluded.note`
      ).bind(uid, roomId, messageId, note || null, now).run();
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'remove') {
    const messageId = parseInt(body.message_id, 10);
    if (!messageId || messageId < 1) return Response.json({ error: 'invalid message_id' }, { status: 400 });
    await db.prepare(`DELETE FROM message_bookmarks WHERE user_id = ? AND message_id = ?`).bind(uid, messageId).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
