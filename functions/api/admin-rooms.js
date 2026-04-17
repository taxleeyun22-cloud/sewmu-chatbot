// 관리자 상담방 관리:
// - GET  /api/admin-rooms : 방 목록 (최근순)
// - GET  /api/admin-rooms?room_id=XX : 방 상세 (멤버 + 최근 메시지)
// - POST /api/admin-rooms : 방 생성 { name, member_user_ids: [] }
// - POST /api/admin-rooms?action=add_member : { room_id, user_id }
// - POST /api/admin-rooms?action=remove_member : { room_id, user_id }
// - POST /api/admin-rooms?action=close : { room_id }
// - POST /api/admin-rooms?action=reopen : { room_id }
// - POST /api/admin-rooms?action=send : { room_id, content }
// - POST /api/admin-rooms?action=toggle_ai : { room_id, ai_mode }
// - DELETE /api/admin-rooms?room_id=XX : 방 + 메시지 전체 삭제 (신중)

function checkAuth(url, env) {
  const key = url.searchParams.get("key");
  return env.ADMIN_KEY && key === env.ADMIN_KEY;
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS chat_rooms (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_by_admin INTEGER DEFAULT 1,
    created_by_user_id INTEGER,
    max_members INTEGER DEFAULT 5,
    ai_mode TEXT DEFAULT 'on',
    status TEXT DEFAULT 'active',
    created_at TEXT,
    closed_at TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT,
    user_id INTEGER,
    role TEXT DEFAULT 'member',
    joined_at TEXT,
    left_at TEXT,
    last_read_at TEXT,
    PRIMARY KEY (room_id, user_id)
  )`).run();
  try { await db.prepare(`ALTER TABLE conversations ADD COLUMN room_id TEXT`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_conv_room ON conversations(room_id)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id)`).run(); } catch {}
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

function genRoomId() {
  // 6자리 영숫자 (초대코드 겸용)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// GET 목록 or 상세
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (!checkAuth(url, context.env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTables(db);

  const roomId = url.searchParams.get("room_id");

  try {
    if (roomId) {
      // 상세
      const room = await db.prepare(
        `SELECT * FROM chat_rooms WHERE id = ?`
      ).bind(roomId).first();
      if (!room) return Response.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });

      const { results: members } = await db.prepare(`
        SELECT rm.user_id, rm.role, rm.joined_at, rm.left_at,
               u.real_name, u.name, u.profile_image, u.phone
        FROM room_members rm
        LEFT JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ?
        ORDER BY rm.joined_at ASC
      `).bind(roomId).all();

      const { results: messages } = await db.prepare(`
        SELECT c.id, c.role, c.content, c.created_at, c.user_id,
               u.real_name, u.name, u.profile_image
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.room_id = ?
        ORDER BY c.created_at ASC
        LIMIT 500
      `).bind(roomId).all();

      return Response.json({ room, members: members || [], messages: messages || [] });
    }

    // 목록
    const { results } = await db.prepare(`
      SELECT r.*,
             (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND left_at IS NULL) as member_count,
             (SELECT COUNT(*) FROM conversations WHERE room_id = r.id) as msg_count,
             (SELECT MAX(created_at) FROM conversations WHERE room_id = r.id) as last_msg_at
      FROM chat_rooms r
      ORDER BY r.status ASC, last_msg_at DESC NULLS LAST, r.created_at DESC
      LIMIT 100
    `).all();

    return Response.json({ rooms: results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST: 생성/멤버관리/종료/메시지/AI토글
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (!checkAuth(url, context.env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTables(db);

  const action = url.searchParams.get("action") || "create";
  const now = kst();

  try {
    const body = await context.request.json();

    // ── 방 생성 ──
    if (action === "create") {
      const name = (body.name || "").trim() || "상담방";
      const maxMembers = Math.min(Math.max(Number(body.max_members) || 5, 2), 10);
      const memberIds = Array.isArray(body.member_user_ids) ? body.member_user_ids : [];

      // 6자리 ID 생성 (중복 회피)
      let roomId;
      for (let i = 0; i < 20; i++) {
        roomId = genRoomId();
        const exists = await db.prepare(`SELECT id FROM chat_rooms WHERE id = ?`).bind(roomId).first();
        if (!exists) break;
      }

      await db.prepare(`
        INSERT INTO chat_rooms (id, name, created_by_admin, max_members, ai_mode, status, created_at)
        VALUES (?, ?, 1, ?, 'on', 'active', ?)
      `).bind(roomId, name, maxMembers, now).run();

      // 멤버 추가
      for (const uid of memberIds) {
        try {
          await db.prepare(`
            INSERT INTO room_members (room_id, user_id, role, joined_at)
            VALUES (?, ?, 'member', ?)
          `).bind(roomId, Number(uid), now).run();
        } catch {}
      }

      return Response.json({ ok: true, room_id: roomId });
    }

    const roomId = body.room_id;
    if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });

    // ── 멤버 추가 ──
    if (action === "add_member") {
      const userId = Number(body.user_id);
      if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

      // 인원 한도 체크
      const cnt = await db.prepare(
        `SELECT COUNT(*) as c, (SELECT max_members FROM chat_rooms WHERE id = ?) as maxc
         FROM room_members WHERE room_id = ? AND left_at IS NULL`
      ).bind(roomId, roomId).first();
      if (cnt && cnt.c >= cnt.maxc) {
        return Response.json({ error: "정원이 가득찼습니다" }, { status: 400 });
      }

      await db.prepare(`
        INSERT INTO room_members (room_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET left_at = NULL
      `).bind(roomId, userId, now).run();
      return Response.json({ ok: true });
    }

    // ── 멤버 제거 ──
    if (action === "remove_member") {
      const userId = Number(body.user_id);
      await db.prepare(
        `UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?`
      ).bind(now, roomId, userId).run();
      return Response.json({ ok: true });
    }

    // ── 방 종료 ──
    if (action === "close") {
      await db.prepare(
        `UPDATE chat_rooms SET status = 'closed', closed_at = ? WHERE id = ?`
      ).bind(now, roomId).run();
      return Response.json({ ok: true });
    }

    // ── 방 재개 ──
    if (action === "reopen") {
      await db.prepare(
        `UPDATE chat_rooms SET status = 'active', closed_at = NULL WHERE id = ?`
      ).bind(roomId).run();
      return Response.json({ ok: true });
    }

    // ── AI 모드 토글 ──
    if (action === "toggle_ai") {
      const mode = body.ai_mode === 'off' ? 'off' : 'on';
      await db.prepare(
        `UPDATE chat_rooms SET ai_mode = ? WHERE id = ?`
      ).bind(mode, roomId).run();
      return Response.json({ ok: true, ai_mode: mode });
    }

    // ── 세무사 메시지 전송 ──
    if (action === "send") {
      const content = (body.content || "").trim();
      if (!content) return Response.json({ error: "content required" }, { status: 400 });
      if (content.length > 5000) return Response.json({ error: "메시지가 너무 깁니다" }, { status: 400 });
      await db.prepare(`
        INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
        VALUES (?, NULL, 'human_advisor', ?, ?, ?)
      `).bind('room_' + roomId, content, roomId, now).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: 방 + 모든 메시지 삭제 (영구)
export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  if (!checkAuth(url, context.env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTables(db);

  const roomId = url.searchParams.get("room_id");
  if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });

  try {
    await db.prepare(`DELETE FROM conversations WHERE room_id = ?`).bind(roomId).run();
    await db.prepare(`DELETE FROM room_members WHERE room_id = ?`).bind(roomId).run();
    await db.prepare(`DELETE FROM chat_rooms WHERE id = ?`).bind(roomId).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
