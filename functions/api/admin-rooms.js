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

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";
import { notifyUser } from "./_webpush.js";

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
  /* 세무사가 담당 거래처를 1/2/3 우선순위로 분류 */
  try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN priority INTEGER`).run(); } catch {}
  /* 방별 전화번호(거래처 사장 번호) */
  try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN phone TEXT`).run(); } catch {}
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

  // 대화 AI 요약
  const action = url.searchParams.get("action");
  if (action === "summarize") {
    return await summarizeRoom(
      context, db,
      url.searchParams.get("room_id"),
      url.searchParams.get("range") || 'recent',
      url.searchParams.get("from") || '',
      url.searchParams.get("to") || ''
    );
  }

  const roomId = url.searchParams.get("room_id");
  const view = url.searchParams.get("view") || "";  // "media" | "search"
  const searchQ = (url.searchParams.get("search") || "").trim();

  try {
    if (roomId && view === "media") {
      // 방 미디어·링크 갤러리
      // 일반 [IMG] 사진 + [DOC:id] 문서(영수증 등)에 첨부된 이미지 모두 포함
      const { results: imgRows } = await db.prepare(`
        SELECT c.id, c.content, c.created_at, c.user_id, c.role,
               u.real_name, u.name
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.room_id = ? AND (c.content LIKE '[IMG]%' OR c.content LIKE '[DOC:%')
        ORDER BY c.created_at DESC
        LIMIT 300
      `).bind(roomId).all();
      // [DOC:id] 메시지의 image_key를 [IMG] 형태로 정규화
      const photos = [];
      for (const r of (imgRows || [])) {
        if ((r.content || '').startsWith('[DOC:')) {
          const m = /^\[DOC:(\d+)\]/.exec(r.content);
          if (m) {
            try {
              const d = await db.prepare(`SELECT image_key, doc_type, vendor FROM documents WHERE id=?`).bind(parseInt(m[1],10)).first();
              if (d?.image_key) {
                photos.push({
                  ...r,
                  content: `[IMG]/api/image?k=${encodeURIComponent(d.image_key)}`,
                  doc_type: d.doc_type, vendor: d.vendor
                });
              }
            } catch {}
          }
        } else {
          photos.push(r);
        }
      }

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
        SELECT c.id, c.role, c.content, c.created_at, c.user_id, c.deleted_at,
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

      // [DOC:id] 메시지에 documents 정보 JOIN
      try {
        const docIds = [];
        for (const m of (messages || [])) {
          const mm = /^\[DOC:(\d+)\]/.exec(m.content || '');
          if (mm) docIds.push(parseInt(mm[1], 10));
        }
        if (docIds.length) {
          const placeholders = docIds.map(() => '?').join(',');
          const { results: docs } = await db.prepare(
            `SELECT id, user_id, doc_type, image_key, ocr_status, ocr_confidence,
                    vendor, vendor_biz_no, amount, vat_amount, receipt_date,
                    category, category_src, status, note, approver_id, approved_at, reject_reason, created_at
             FROM documents WHERE id IN (${placeholders})`
          ).bind(...docIds).all();
          const byId = {};
          (docs || []).forEach(d => byId[d.id] = d);
          for (const m of messages) {
            const mm = /^\[DOC:(\d+)\]/.exec(m.content || '');
            if (mm) {
              const d = byId[parseInt(mm[1], 10)];
              if (d) m.document = d;
            }
          }
        }
      } catch (e) {}

      return Response.json({ room, members: members || [], messages: messages || [] });
    }

    // 목록 — priority 먼저, 최근순. 카톡 스타일 미리보기·아바타 포함
    const { results } = await db.prepare(`
      SELECT r.*,
             (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND left_at IS NULL) as member_count,
             (SELECT COUNT(*) FROM conversations WHERE room_id = r.id) as msg_count,
             (SELECT COUNT(*) FROM conversations WHERE room_id = r.id AND role = 'user') as user_msg_count,
             (SELECT MAX(created_at) FROM conversations WHERE room_id = r.id AND role = 'user') as last_user_msg_at,
             (SELECT MAX(created_at) FROM conversations WHERE room_id = r.id) as last_msg_at,
             (SELECT content FROM conversations WHERE room_id = r.id AND (deleted_at IS NULL) ORDER BY created_at DESC LIMIT 1) as last_msg_content,
             (SELECT role    FROM conversations WHERE room_id = r.id AND (deleted_at IS NULL) ORDER BY created_at DESC LIMIT 1) as last_msg_role
      FROM chat_rooms r
      ORDER BY r.status ASC,
               COALESCE(r.priority, 99) ASC,
               last_msg_at DESC NULLS LAST,
               r.created_at DESC
      LIMIT 200
    `).all();

    /* 각 방의 첫 멤버 정보 (아바타용) 일괄 조회 */
    const roomIds = (results || []).map(r => r.id);
    const avatarByRoom = {};
    if (roomIds.length) {
      const placeholders = roomIds.map(() => '?').join(',');
      try {
        const { results: mems } = await db.prepare(
          `SELECT rm.room_id, u.real_name, u.name, u.profile_image
           FROM room_members rm LEFT JOIN users u ON rm.user_id = u.id
           WHERE rm.room_id IN (${placeholders}) AND rm.left_at IS NULL AND rm.user_id IS NOT NULL
           ORDER BY rm.joined_at ASC`
        ).bind(...roomIds).all();
        for (const m of (mems || [])) {
          if (!avatarByRoom[m.room_id]) {
            avatarByRoom[m.room_id] = {
              name: m.real_name || m.name || '',
              profile_image: m.profile_image || null,
            };
          }
        }
      } catch {}
    }
    for (const r of (results || [])) {
      const a = avatarByRoom[r.id];
      r.first_member_name = a?.name || '';
      r.first_member_profile = a?.profile_image || null;
      /* 미리보기: 80자 제한, [IMG]·[FILE]·[DOC] 프리픽스 치환 */
      if (r.last_msg_content) {
        const c = r.last_msg_content;
        if (c.startsWith('[IMG]')) r.last_msg_preview = '📷 사진';
        else if (c.startsWith('[FILE]')) r.last_msg_preview = '📁 파일';
        else if (c.startsWith('[DOC:')) r.last_msg_preview = '🧾 영수증/문서';
        else if (c.startsWith('[ALERT]')) r.last_msg_preview = '🔔 알림';
        else if (c.startsWith('[REPLY]')) {
          /* 답장 프리픽스 제거 후 본문 표시 */
          const m2 = /^\[REPLY\]\{[^\n]+\}\n([\s\S]*)$/.exec(c);
          r.last_msg_preview = (m2?.[1] || c).replace(/\s+/g, ' ').slice(0, 60);
        }
        else r.last_msg_preview = c.replace(/\s+/g, ' ').slice(0, 60);
      } else {
        r.last_msg_preview = null;
      }
      delete r.last_msg_content; // 전체 원문은 목록에 보낼 필요 없음
    }

    return Response.json({ rooms: results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST: 생성/멤버관리/종료/메시지/AI토글
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
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

    // ── 방 종료 (owner 전용) ──
    if (action === "close") {
      if (!auth.owner) return ownerOnly();
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

    // ── 방 재개 (owner 전용) ──
    if (action === "reopen") {
      if (!auth.owner) return ownerOnly();
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

    /* 우선순위 지정 (1/2/3 또는 NULL) */
    if (action === "set_priority") {
      const raw = body.priority;
      let p = null;
      if (raw !== null && raw !== undefined && raw !== '') {
        const n = Number(raw);
        if (n === 1 || n === 2 || n === 3) p = n;
        else return Response.json({ error: '1/2/3 또는 null 만 허용' }, { status: 400 });
      }
      await db.prepare(`UPDATE chat_rooms SET priority = ? WHERE id = ?`).bind(p, roomId).run();
      return Response.json({ ok: true, priority: p });
    }

    /* 방별 전화번호 (거래처 사장 번호) 설정 */
    if (action === "set_phone") {
      let phone = (body.phone || '').toString().trim();
      /* 간단 정규화: 숫자·+·- 만 남김. 빈 문자열이면 null로 저장(기본번호 폴백) */
      if (phone) {
        phone = phone.replace(/[^\d+\-]/g, '');
        if (phone.length < 4) return Response.json({ error: '전화번호 형식이 올바르지 않습니다' }, { status: 400 });
      }
      await db.prepare(`UPDATE chat_rooms SET phone = ? WHERE id = ?`).bind(phone || null, roomId).run();
      return Response.json({ ok: true, phone: phone || null });
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
      /* 보안: image_url / file_url은 내부 프록시 경로만. 외부 URL·javascript:·data: 차단 */
      if (imageUrl && !/^\/api\/image\?k=[A-Za-z0-9%._\-\/]+$/.test(imageUrl)) {
        return Response.json({ error: '허용되지 않은 image_url' }, { status: 400 });
      }
      if (fileUrl && !/^\/api\/file\?k=[A-Za-z0-9%._\-\/]+(&name=[A-Za-z0-9%._\-]*)?$/.test(fileUrl)) {
        return Response.json({ error: '허용되지 않은 file_url' }, { status: 400 });
      }
      if (fileName && /[\r\n\t\\\/\x00-\x1f]/.test(fileName)) {
        return Response.json({ error: '파일명에 금지된 문자' }, { status: 400 });
      }
      if (fileName.length > 200) return Response.json({ error: '파일명이 너무 깁니다' }, { status: 400 });
      if (fileSize < 0 || fileSize > 500 * 1024 * 1024) return Response.json({ error: 'file_size 범위 초과' }, { status: 400 });
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

      // 푸시 알림 발송 (방의 모든 멤버에게)
      try {
        const roomMeta = await db.prepare(`SELECT name FROM chat_rooms WHERE id = ?`).bind(roomId).first();
        const { results: members } = await db.prepare(
          `SELECT user_id FROM room_members WHERE room_id = ? AND left_at IS NULL AND user_id IS NOT NULL`
        ).bind(roomId).all();
        const bodyText = fileUrl ? '📁 파일' : imageUrl ? '📷 사진' : content.slice(0, 80);
        for (const m of (members || [])) {
          await notifyUser(db, context.env, m.user_id, {
            title: '💬 ' + (roomMeta?.name || '상담방'),
            body: '세무사: ' + bodyText,
            tag: 'room-' + roomId,
            url: '/?room=' + roomId,
          });
        }
      } catch (e) { /* push 실패는 메시지 전송 자체에 영향 없음 */ }

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

// DELETE: 방 + 모든 메시지 삭제 (영구) — owner 전용
export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();
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

// 상담방 대화 AI 요약
async function summarizeRoom(context, db, roomId, range, fromDate, toDate) {
  if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });
  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  range = range || 'recent';

  // 기간별 쿼리 분기
  let query, binds;
  if (range === 'recent') {
    // 최근 50건
    query = `SELECT c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
             FROM conversations c LEFT JOIN users u ON c.user_id = u.id
             WHERE c.room_id = ?
             ORDER BY c.created_at DESC LIMIT 50`;
    binds = [roomId];
  } else if (range === 'week') {
    query = `SELECT c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
             FROM conversations c LEFT JOIN users u ON c.user_id = u.id
             WHERE c.room_id = ? AND datetime(c.created_at) >= datetime('now','-7 days')
             ORDER BY c.created_at DESC LIMIT 300`;
    binds = [roomId];
  } else if (range === 'month') {
    const ym = new Date(Date.now()+9*60*60*1000).toISOString().substring(0,7);
    query = `SELECT c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
             FROM conversations c LEFT JOIN users u ON c.user_id = u.id
             WHERE c.room_id = ? AND substr(c.created_at,1,7) = ?
             ORDER BY c.created_at DESC LIMIT 500`;
    binds = [roomId, ym];
  } else if (range === 'custom') {
    // 사용자 지정 기간 (from ~ to, 포함 YYYY-MM-DD)
    const fromOK = /^\d{4}-\d{2}-\d{2}$/.test(fromDate || '');
    const toOK = /^\d{4}-\d{2}-\d{2}$/.test(toDate || '');
    if (!fromOK || !toOK) return Response.json({ error: "기간을 YYYY-MM-DD 형식으로 지정해주세요" }, { status: 400 });
    if (fromDate > toDate) return Response.json({ error: "시작일이 종료일보다 늦습니다" }, { status: 400 });
    query = `SELECT c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
             FROM conversations c LEFT JOIN users u ON c.user_id = u.id
             WHERE c.room_id = ? AND substr(c.created_at,1,10) >= ? AND substr(c.created_at,1,10) <= ?
             ORDER BY c.created_at DESC LIMIT 1000`;
    binds = [roomId, fromDate, toDate];
  } else { // all
    query = `SELECT c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
             FROM conversations c LEFT JOIN users u ON c.user_id = u.id
             WHERE c.room_id = ?
             ORDER BY c.created_at DESC LIMIT 500`;
    binds = [roomId];
  }
  const { results: msgs } = await db.prepare(query).bind(...binds).all();

  if (!msgs || !msgs.length) {
    return Response.json({ ok: true, summary: "(대화 내용이 없습니다)", message_count: 0 });
  }

  // 시간순으로 재정렬
  const chrono = msgs.slice().reverse();

  // 컨텐츠 축약 (특수 프리픽스 제거·단축)
  const lines = [];
  for (const m of chrono) {
    if (m.deleted_at) continue;
    let content = (m.content || "").trim();
    if (!content) continue;
    // [IMG]/[FILE]/[DOC:id]/[REPLY]/[ALERT] 축약
    if (/^\[IMG\]/.test(content)) content = "(사진 전송)";
    else if (/^\[FILE\]/.test(content)) content = "(파일 전송)";
    else if (/^\[DOC:\d+\]/.test(content)) content = "(영수증/문서 업로드)";
    else if (/^\[ALERT\]/.test(content)) {
      try { const a = JSON.parse(content.replace(/^\[ALERT\]/, '')); content = `[시스템 알림] ${a.t || ''}: ${a.m || ''}`; } catch { content = "(알림)"; }
    }
    else if (/^\[REPLY\]/.test(content)) {
      const mm = /^\[REPLY\]\{[^\n]+\}\n([\s\S]*)$/.exec(content);
      if (mm) content = mm[1];
    }
    if (content.length > 500) content = content.substring(0, 500) + "…";
    const who = m.role === 'assistant' ? '🤖 AI'
              : m.role === 'human_advisor' ? '👨‍💼 세무사'
              : '👤 ' + (m.real_name || m.name || '고객');
    const t = (m.created_at || '').substring(0, 16);
    lines.push(`[${t}] ${who}: ${content}`);
  }

  if (!lines.length) return Response.json({ ok: true, summary: "(대화 내용이 없습니다)", message_count: 0 });

  const conversation = lines.join('\n');
  /* 실제 대화의 첫·마지막 시점 (non-deleted 기준) */
  const firstAt = (chrono.find(m => !m.deleted_at)?.created_at || '').substring(0,16);
  const lastAt = ([...chrono].reverse().find(m => !m.deleted_at)?.created_at || '').substring(0,16);

  // GPT-4o-mini 로 요약 (저렴)
  const prompt = `아래는 세무회계 이윤의 상담방 대화 기록이야. 이 대화를 세무사가 빠르게 파악할 수 있게 요약해줘.

대화 시점: ${firstAt} ~ ${lastAt} (총 ${lines.length}건)

포맷:
## ⏱ 상담 시점
${firstAt} ~ ${lastAt} (총 ${lines.length}건)
(위 시점 그대로 한 줄 넣어줘. 본문 논의 사항에도 "4월 15일에 부가세 질문" 같이 날짜를 녹여줘)

## 📌 핵심 요약
(3-5줄로 무슨 상담인지)

## 💬 주요 논의 사항
- (항목별 bullet, 가능하면 날짜 포함)

## 📄 고객이 올린 자료
- (영수증·계약서 등 있으면 언제 올렸는지 포함, 없으면 "없음")

## ⏳ 후속 조치 필요
- (세무사가 해야할 일, 답변 대기 중인 질문, 등. 없으면 "없음")

## 🔑 키워드
(5-10개 세무 키워드)

---대화 기록---
${conversation}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 900,
        temperature: 0.3,
        messages: [
          { role: 'system', content: '당신은 세무 상담 요약 전문가입니다. 마크다운 출력.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const d = await res.json();
    if (!res.ok) return Response.json({ error: d?.error?.message || 'OpenAI error' }, { status: 500 });
    const summary = d.choices?.[0]?.message?.content || '(요약 실패)';
    const usage = d.usage || {};
    // 비용: gpt-4o-mini $0.15/1M in + $0.60/1M out → 대략 1회 10원 내외
    const costCents = (usage.prompt_tokens || 0) * 0.15 / 10000 + (usage.completion_tokens || 0) * 0.60 / 10000;
    return Response.json({
      ok: true,
      summary,
      message_count: lines.length,
      first_at: firstAt,
      last_at: lastAt,
      usage,
      cost_cents: costCents,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
