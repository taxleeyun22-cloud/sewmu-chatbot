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

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

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
  await db.prepare(`CREATE TABLE IF NOT EXISTS room_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_user_id INTEGER,
    pinned INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_notices_room ON room_notices(room_id)`).run(); } catch {}
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
  try { await db.prepare(`ALTER TABLE conversations ADD COLUMN deleted_at TEXT`).run(); } catch {}
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
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTables(db);

  const roomId = url.searchParams.get("room_id");
  const view = url.searchParams.get("view") || "";  // "media" | "search"
  const searchQ = (url.searchParams.get("search") || "").trim();

  try {
    if (roomId && view === "media") {
      // 방 미디어·링크 갤러리
      const { results: photos } = await db.prepare(`
        SELECT c.id, c.content, c.created_at, c.user_id, c.role,
               u.real_name, u.name
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.room_id = ? AND c.content LIKE '[IMG]%'
        ORDER BY c.created_at DESC
        LIMIT 200
      `).bind(roomId).all();

      const { results: linkCandidates } = await db.prepare(`
        SELECT c.id, c.content, c.created_at, c.user_id, c.role,
               u.real_name, u.name
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.room_id = ? AND (c.content LIKE '%http://%' OR c.content LIKE '%https://%')
        ORDER BY c.created_at DESC
        LIMIT 200
      `).bind(roomId).all();

      // 링크 추출 (http(s)://... 정규식, 같은 행에 여러 개 가능)
      const urlRe = /https?:\/\/[^\s<>"']+/gi;
      const links = [];
      for (const m of (linkCandidates || [])) {
        const matches = String(m.content || '').match(urlRe) || [];
        for (const u of matches) {
          links.push({
            url: u,
            message_id: m.id,
            created_at: m.created_at,
            role: m.role,
            user_name: m.real_name || m.name || null,
          });
        }
      }

      return Response.json({ photos: photos || [], links });
    }

    if (roomId && view === "files") {
      // 파일 메시지만 모아서 반환
      const { results } = await db.prepare(`
        SELECT c.id, c.content, c.created_at, c.role, c.user_id,
               u.real_name, u.name
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.room_id = ? AND c.content LIKE '[FILE]%'
        ORDER BY c.created_at DESC
        LIMIT 200
      `).bind(roomId).all();
      return Response.json({ files: results || [] });
    }

    if (roomId && view === "notices") {
      // 게시판 목록 (pinned 우선, 최신순)
      const { results } = await db.prepare(`
        SELECT n.id, n.title, n.content, n.author_user_id, n.pinned, n.created_at, n.updated_at,
               u.real_name, u.name
        FROM room_notices n
        LEFT JOIN users u ON n.author_user_id = u.id
        WHERE n.room_id = ?
        ORDER BY n.pinned DESC, n.created_at DESC
        LIMIT 100
      `).bind(roomId).all();
      return Response.json({ notices: results || [] });
    }

    if (roomId && searchQ) {
      // 방 내부 검색
      const pat = `%${searchQ}%`;
      const { results: matches } = await db.prepare(`
        SELECT c.id, c.role, c.content, c.created_at, c.user_id,
               u.real_name, u.name
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.room_id = ? AND c.content LIKE ?
        ORDER BY c.created_at DESC
        LIMIT 100
      `).bind(roomId, pat).all();
      return Response.json({ matches: matches || [], query: searchQ });
    }

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
               u.real_name, u.name, u.profile_image,
               (SELECT COUNT(*) FROM room_members rm
                WHERE rm.room_id = c.room_id
                  AND rm.user_id != COALESCE(c.user_id, -1)
                  AND rm.left_at IS NULL
                  AND (rm.last_read_at IS NULL OR rm.last_read_at < c.created_at)
               ) as unread_count
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
  if (!(await checkAdmin(context))) return adminUnauthorized();
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

    // ── 방 이름 수정 ──
    if (action === "rename") {
      const name = (body.name || "").trim();
      if (!name) return Response.json({ error: "이름을 입력해 주세요" }, { status: 400 });
      if (name.length > 50) return Response.json({ error: "이름이 너무 깁니다 (50자 이내)" }, { status: 400 });
      await db.prepare(
        `UPDATE chat_rooms SET name = ? WHERE id = ?`
      ).bind(name, roomId).run();
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
      const imageUrl = (body.image_url || "").trim();
      const fileUrl = (body.file_url || "").trim();
      const fileName = (body.file_name || "").trim();
      const fileSize = Number(body.file_size || 0);
      if (!content && !imageUrl && !fileUrl) return Response.json({ error: "content or image_url or file_url required" }, { status: 400 });
      if (content.length > 5000) return Response.json({ error: "메시지가 너무 깁니다" }, { status: 400 });
      let finalContent;
      if (fileUrl) {
        const meta = JSON.stringify({ url: fileUrl, name: fileName, size: fileSize });
        finalContent = content ? `[FILE]${meta}\n${content}` : `[FILE]${meta}`;
      } else if (imageUrl) {
        finalContent = content ? `[IMG]${imageUrl}\n${content}` : `[IMG]${imageUrl}`;
      } else {
        finalContent = content;
      }
      await db.prepare(`
        INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
        VALUES (?, NULL, 'human_advisor', ?, ?, ?)
      `).bind('room_' + roomId, finalContent, roomId, now).run();
      return Response.json({ ok: true });
    }

    // ── 게시판: 작성 ──
    if (action === "notice_create") {
      const title = (body.title || "").trim();
      const content = (body.content || "").trim();
      if (!title || !content) return Response.json({ error: "제목과 내용을 입력해 주세요" }, { status: 400 });
      if (title.length > 100) return Response.json({ error: "제목은 100자 이내" }, { status: 400 });
      if (content.length > 5000) return Response.json({ error: "내용이 너무 깁니다" }, { status: 400 });
      const r = await db.prepare(
        `INSERT INTO room_notices (room_id, title, content, author_user_id, pinned, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 0, ?, ?)`
      ).bind(roomId, title, content, now, now).run();
      return Response.json({ ok: true, id: r.meta?.last_row_id });
    }

    // ── 게시판: 수정 ──
    if (action === "notice_update") {
      const noticeId = Number(body.notice_id);
      const title = (body.title || "").trim();
      const content = (body.content || "").trim();
      if (!noticeId || !title || !content) return Response.json({ error: "필수값 누락" }, { status: 400 });
      await db.prepare(
        `UPDATE room_notices SET title = ?, content = ?, updated_at = ? WHERE id = ? AND room_id = ?`
      ).bind(title, content, now, noticeId, roomId).run();
      return Response.json({ ok: true });
    }

    // ── 게시판: 고정/해제 ──
    if (action === "notice_pin") {
      const noticeId = Number(body.notice_id);
      const pinned = body.pinned ? 1 : 0;
      if (!noticeId) return Response.json({ error: "notice_id required" }, { status: 400 });
      await db.prepare(
        `UPDATE room_notices SET pinned = ?, updated_at = ? WHERE id = ? AND room_id = ?`
      ).bind(pinned, now, noticeId, roomId).run();
      return Response.json({ ok: true });
    }

    // ── 게시판: 삭제 ──
    // ── 메시지 삭제 (admin은 어떤 메시지든 삭제 가능) ──
    if (action === "delete_message") {
      const messageId = Number(body.message_id);
      if (!messageId) return Response.json({ error: "message_id required" }, { status: 400 });
      await db.prepare(
        `UPDATE conversations SET deleted_at = ? WHERE id = ? AND room_id = ?`
      ).bind(now, messageId, roomId).run();
      return Response.json({ ok: true });
    }

    if (action === "notice_delete") {
      const noticeId = Number(body.notice_id);
      if (!noticeId) return Response.json({ error: "notice_id required" }, { status: 400 });
      await db.prepare(
        `DELETE FROM room_notices WHERE id = ? AND room_id = ?`
      ).bind(noticeId, roomId).run();
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
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTables(db);

  const roomId = url.searchParams.get("room_id");
  if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });

  try {
    await db.prepare(`DELETE FROM conversations WHERE room_id = ?`).bind(roomId).run();
    await db.prepare(`DELETE FROM room_members WHERE room_id = ?`).bind(roomId).run();
    try { await db.prepare(`DELETE FROM room_notices WHERE room_id = ?`).bind(roomId).run(); } catch {}
    await db.prepare(`DELETE FROM chat_rooms WHERE id = ?`).bind(roomId).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
