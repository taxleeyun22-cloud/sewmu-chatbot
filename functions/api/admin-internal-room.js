/**
 * Phase M8 (2026-05-05 사장님 명령): 관리자방 자동 초대 채팅방
 *
 * 사장님 직접 인용:
 * > "관리자방은 상담방개설 이런개념이 아님 그냥 관리자 자동초대되서 이야기 할수있는거임"
 *
 * 동작:
 * - GET /api/admin-internal-room
 * - is_internal=1 chat_rooms 1개 자동 보장 (없으면 생성)
 * - is_admin=1 사용자 모두 자동 멤버 추가 (room_members)
 * - 응답: { ok, room_id, name }
 *
 * 사이드바 🔐 관리자방 클릭 시 admin.js _adminSidebarClick → 이 API 호출 →
 * tab('rooms') + loadRoomDetail(room_id).
 */

import { checkAdmin } from './_adminAuth.js';

const INTERNAL_ROOM_NAME = '🔐 관리자방';

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return Response.json({ error: 'unauth' }, { status: 401 });

  const db = context.env.DB || context.env.db;
  if (!db) return Response.json({ error: 'DB binding missing' }, { status: 500 });

  try {
    /* lazy migration — chat_rooms / room_members / is_internal 컬럼 보장 */
    await db.prepare(`CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_by_admin INTEGER DEFAULT 1,
      created_by_user_id INTEGER,
      max_members INTEGER DEFAULT 10,
      ai_mode TEXT DEFAULT 'off',
      status TEXT DEFAULT 'active',
      created_at TEXT,
      closed_at TEXT
    )`).run();
    try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN is_internal INTEGER DEFAULT 0`).run(); } catch (_) {}
    try { await db.prepare(`UPDATE chat_rooms SET max_members = 50 WHERE is_internal = 1 AND (max_members IS NULL OR max_members < 50)`).run(); } catch (_) {}
    await db.prepare(`CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT,
      user_id INTEGER,
      role TEXT DEFAULT 'member',
      joined_at TEXT,
      left_at TEXT,
      last_read_at TEXT,
      PRIMARY KEY (room_id, user_id)
    )`).run();

    /* 1. internal 방 1개 fetch */
    let room = await db.prepare(
      `SELECT id, name FROM chat_rooms WHERE is_internal = 1 AND status != 'closed' ORDER BY created_at ASC LIMIT 1`
    ).first();

    /* 2. 없으면 생성 */
    if (!room) {
      const id = 'internal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT INTO chat_rooms (id, name, created_by_admin, created_by_user_id, max_members, ai_mode, status, created_at, is_internal)
         VALUES (?, ?, 1, ?, 50, 'off', 'active', ?, 1)`
      ).bind(id, INTERNAL_ROOM_NAME, auth.userId || null, now).run();
      room = { id, name: INTERNAL_ROOM_NAME };
    }

    /* 3. 모든 admin (is_admin=1) 사용자 자동 멤버 추가 (없는 사람만) */
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT OR IGNORE INTO room_members (room_id, user_id, role, joined_at)
      SELECT ?, id, 'admin', ? FROM users WHERE is_admin = 1
    `).bind(room.id, now).run();

    /* 4. left_at 채워졌던 admin 멤버 복구 (재진입) */
    await db.prepare(`
      UPDATE room_members SET left_at = NULL
      WHERE room_id = ? AND user_id IN (SELECT id FROM users WHERE is_admin = 1) AND left_at IS NOT NULL
    `).bind(room.id).run();

    /* 5. 멤버 수 조회 (응답용) */
    const memberRow = await db.prepare(
      `SELECT COUNT(*) AS cnt FROM room_members WHERE room_id = ? AND left_at IS NULL`
    ).bind(room.id).first();

    return Response.json({
      ok: true,
      room_id: room.id,
      name: room.name,
      member_count: memberRow ? memberRow.cnt : 0,
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
