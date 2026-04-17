// 사용자 본인의 상담방 관리
// - GET: 내가 초대받은 방 목록
// - GET?room_id=XX: 방 메시지 + 멤버 (권한 체크)
// - POST?action=send: 방에 메시지 전송
// - POST?action=leave: 방 나가기

async function getUserFromCookie(db, request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  try {
    const row = await db.prepare(
      `SELECT s.user_id, u.real_name, u.name, u.approval_status FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).bind(match[1]).first();
    return row || null;
  } catch { return null; }
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
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

// GET: 내 방 목록 or 방 상세
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ rooms: [] });

  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });

  await ensureTables(db);

  const url = new URL(context.request.url);
  const roomId = url.searchParams.get("room_id");
  const since = url.searchParams.get("since");

  try {
    if (roomId) {
      // 권한 체크: 내가 이 방의 멤버인지
      const membership = await db.prepare(
        `SELECT role, left_at FROM room_members WHERE room_id = ? AND user_id = ?`
      ).bind(roomId, user.user_id).first();
      if (!membership || membership.left_at) {
        return Response.json({ error: "방에 대한 접근 권한이 없습니다" }, { status: 403 });
      }

      // 방 정보
      const room = await db.prepare(`SELECT * FROM chat_rooms WHERE id = ?`).bind(roomId).first();
      if (!room) return Response.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });

      // 멤버 목록 (이름만)
      const { results: members } = await db.prepare(`
        SELECT rm.user_id, rm.role, u.real_name, u.name, u.profile_image
        FROM room_members rm
        LEFT JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ? AND rm.left_at IS NULL
        ORDER BY rm.joined_at ASC
      `).bind(roomId).all();

      // 메시지
      let query = `
        SELECT c.id, c.role, c.content, c.created_at, c.user_id,
               u.real_name, u.name, u.profile_image
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.room_id = ?
      `;
      const binds = [roomId];
      if (since) { query += ` AND c.created_at > ?`; binds.push(since); }
      query += ` ORDER BY c.created_at ASC LIMIT 500`;

      const { results: messages } = await db.prepare(query).bind(...binds).all();

      // 마지막 읽은 시각 갱신
      try {
        await db.prepare(
          `UPDATE room_members SET last_read_at = ? WHERE room_id = ? AND user_id = ?`
        ).bind(kst(), roomId, user.user_id).run();
      } catch {}

      return Response.json({
        room,
        members: members || [],
        messages: messages || [],
      });
    }

    // 내 방 목록
    const { results } = await db.prepare(`
      SELECT r.id, r.name, r.status, r.ai_mode, r.created_at,
             (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND left_at IS NULL) as member_count,
             (SELECT MAX(created_at) FROM conversations WHERE room_id = r.id) as last_msg_at,
             (SELECT content FROM conversations WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_msg,
             (SELECT COUNT(*) FROM conversations c
              WHERE c.room_id = r.id
                AND c.created_at > COALESCE(rm.last_read_at, '1970-01-01')
                AND c.user_id != ? ) as unread_count,
             rm.last_read_at
      FROM chat_rooms r
      INNER JOIN room_members rm ON rm.room_id = r.id
      WHERE rm.user_id = ? AND rm.left_at IS NULL
      ORDER BY last_msg_at DESC NULLS LAST, r.created_at DESC
      LIMIT 50
    `).bind(user.user_id, user.user_id).all();

    return Response.json({ rooms: results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST: 메시지 전송 or 나가기
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });

  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get("action") || "send";

  try {
    const body = await context.request.json();
    const roomId = body.room_id;
    if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });

    // 방 존재 + 멤버십 체크
    const membership = await db.prepare(
      `SELECT role, left_at FROM room_members WHERE room_id = ? AND user_id = ?`
    ).bind(roomId, user.user_id).first();
    if (!membership || membership.left_at) {
      return Response.json({ error: "방에 대한 접근 권한이 없습니다" }, { status: 403 });
    }

    const room = await db.prepare(`SELECT status, ai_mode FROM chat_rooms WHERE id = ?`).bind(roomId).first();
    if (!room) return Response.json({ error: "방 없음" }, { status: 404 });

    const now = kst();

    // ── 나가기 ──
    if (action === "leave") {
      await db.prepare(
        `UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?`
      ).bind(now, roomId, user.user_id).run();
      return Response.json({ ok: true });
    }

    // ── 메시지 전송 ──
    if (action === "send") {
      if (room.status !== 'active') {
        return Response.json({ error: "종료된 방입니다" }, { status: 403 });
      }
      const content = (body.content || "").trim();
      if (!content) return Response.json({ error: "content required" }, { status: 400 });
      if (content.length > 3000) return Response.json({ error: "메시지가 너무 깁니다" }, { status: 400 });

      await db.prepare(`
        INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
        VALUES (?, ?, 'user', ?, ?, ?)
      `).bind('room_' + roomId, user.user_id, content, roomId, now).run();

      // 내 last_read_at 갱신
      await db.prepare(
        `UPDATE room_members SET last_read_at = ? WHERE room_id = ? AND user_id = ?`
      ).bind(now, roomId, user.user_id).run();

      return Response.json({ ok: true, room_ai_mode: room.ai_mode });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
