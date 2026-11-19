// 사용자 본인의 상담방 관리
// - GET: 내가 초대받은 방 목록
// - GET?room_id=XX: 방 메시지 + 멤버 (권한 체크)
// - POST?action=send: 방에 메시지 전송
// - POST?action=leave: 방 나가기

/* 보안 (2026-11-19 점검 C1): 메시지 앞머리 [IMG]·[FILE]·[DOC:n]·[ALERT]·[CHATBOT_SHARE] 는 서버만 붙인다.
   거래처가 글자로 직접 보내면 화면이 그림·파일·영수증으로 해석해 관리자 화면에서 스크립트가 돌 수 있었다.
   [REPLY] 는 화면이 붙여 보내므로 허용하되, 정해진 칸(s·t·i)만 남기고 i 는 영문·숫자만.
   [CHATBOT_SHARE] ("상담방에 공유" 버튼)도 화면이 보내므로 메시지 전체가 그것일 때만, 칸(q·a·t)을 다시 만들어 허용. */
const SYSTEM_PREFIX = /^\[(?:IMG|FILE|DOC:\d*|ALERT|CHATBOT_SHARE|REPLY)\]/;
export function sanitizeUserMessage(content) {
  let reply = '';
  let rest = String(content || '');
  const mr = /^\[REPLY\](\{[^\n]+\})\n([\s\S]*)$/.exec(rest);
  if (mr) {
    let r;
    try { r = JSON.parse(mr[1]); } catch { return { error: '답장 형식이 올바르지 않습니다' }; }
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { error: '답장 형식이 올바르지 않습니다' };
    const i = String(r.i ?? '');
    if (!/^[A-Za-z0-9_-]{0,40}$/.test(i)) return { error: '답장 형식이 올바르지 않습니다' };
    reply = '[REPLY]' + JSON.stringify({ t: String(r.t ?? '').slice(0, 200), s: String(r.s ?? '').slice(0, 50), i }) + '\n';
    rest = mr[2];
  }
  const ms = !reply && /^\[CHATBOT_SHARE\](\{[\s\S]+\})$/.exec(rest);
  if (ms) {
    let o;
    try { o = JSON.parse(ms[1]); } catch { return { error: '공유 형식이 올바르지 않습니다' }; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: '공유 형식이 올바르지 않습니다' };
    return { content: '[CHATBOT_SHARE]' + JSON.stringify({ q: String(o.q ?? '').slice(0, 1000), a: String(o.a ?? '').slice(0, 3000), t: Number(o.t) || Date.now() }) };
  }
  if (SYSTEM_PREFIX.test(rest)) return { error: '보낼 수 없는 메시지 형식입니다' };
  return { content: reply + rest };
}

async function getUserFromCookie(db, request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  try {
    const row = await db.prepare(
      `SELECT s.user_id, u.real_name, u.name, u.approval_status, COALESCE(u.is_admin, 0) AS is_admin FROM sessions s
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
    max_members INTEGER DEFAULT 10,
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
  /* 거래 종료된 사용자는 상담방 접근 전면 차단 (대화 열람·전송 모두 X) */
  if (user.approval_status === 'terminated') {
    return Response.json({ error: "거래가 종료되어 상담방을 이용하실 수 없습니다.\n재문의는 카카오톡 채널 또는 053-269-1213 으로 연락해주세요.", terminated: true }, { status: 403 });
  }

  await ensureTables(db);

  const url = new URL(context.request.url);
  const roomId = url.searchParams.get("room_id");
  const since = url.searchParams.get("since");
  const view = url.searchParams.get("view") || "";
  const searchQ = (url.searchParams.get("search") || "").trim();

  try {
    if (roomId) {
      // 권한 체크: 내가 이 방의 멤버인지. role='admin'(관리자 자동 참여) 이면 고객 뷰 접근 X
      const membership = await db.prepare(
        `SELECT role, left_at FROM room_members WHERE room_id = ? AND user_id = ?`
      ).bind(roomId, user.user_id).first();
      if (!membership || membership.left_at) {
        return Response.json({ error: "방에 대한 접근 권한이 없습니다" }, { status: 403 });
      }
      /* role='admin' 차단은 현재 is_admin=1 인 유저에 한정.
         과거 관리자였다가 강등된 기장거래처 유저는 room_members.role='admin' 이
         남아있어도 본인 방은 열람 허용 (데이터 불일치 방어). */
      if (membership.role === 'admin' && user.is_admin) {
        return Response.json({ error: "이 상담방은 관리자 화면에서만 확인할 수 있습니다" }, { status: 403 });
      }
      /* 종료된 방(status='closed') 또는 내부 업무방은 고객 접근 차단 */
      const rcheck = await db.prepare(
        `SELECT status, COALESCE(is_internal,0) AS is_internal FROM chat_rooms WHERE id = ?`
      ).bind(roomId).first();
      if (!rcheck) return Response.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
      if (rcheck.status === 'closed') return Response.json({ error: "종료된 상담방입니다", closed: true }, { status: 403 });
      if (rcheck.is_internal) return Response.json({ error: "내부 업무방입니다" }, { status: 403 });

      // 서브 뷰: 미디어·파일·공지·검색 (정보 모달용)
      if (view === "media") {
        const { results: photos } = await db.prepare(`
          SELECT c.id, c.content, c.created_at, c.user_id, c.role,
                 u.real_name, u.name
          FROM conversations c LEFT JOIN users u ON c.user_id = u.id
          WHERE c.room_id = ? AND c.content LIKE '[IMG]%'
          ORDER BY c.created_at DESC LIMIT 200
        `).bind(roomId).all();
        const { results: linkCand } = await db.prepare(`
          SELECT c.id, c.content, c.created_at, c.user_id, c.role,
                 u.real_name, u.name
          FROM conversations c LEFT JOIN users u ON c.user_id = u.id
          WHERE c.room_id = ? AND (c.content LIKE '%http://%' OR c.content LIKE '%https://%')
          ORDER BY c.created_at DESC LIMIT 200
        `).bind(roomId).all();
        const urlRe = /https?:\/\/[^\s<>"']+/gi;
        const links = [];
        for (const m of (linkCand || [])) {
          const matches = String(m.content || '').match(urlRe) || [];
          for (const u of matches) {
            links.push({ url: u, message_id: m.id, created_at: m.created_at, role: m.role, user_name: m.real_name || m.name || null });
          }
        }
        return Response.json({ photos: photos || [], links });
      }

      if (view === "files") {
        const { results } = await db.prepare(`
          SELECT c.id, c.content, c.created_at, c.role, c.user_id,
                 u.real_name, u.name
          FROM conversations c LEFT JOIN users u ON c.user_id = u.id
          WHERE c.room_id = ? AND c.content LIKE '[FILE]%'
          ORDER BY c.created_at DESC LIMIT 200
        `).bind(roomId).all();
        return Response.json({ files: results || [] });
      }

      if (view === "notices") {
        let rows = [];
        try {
          const { results } = await db.prepare(`
            SELECT id, title, content, pinned, created_at, updated_at
            FROM room_notices
            WHERE room_id = ?
            ORDER BY pinned DESC, created_at DESC
            LIMIT 100
          `).bind(roomId).all();
          rows = results || [];
        } catch {}
        return Response.json({ notices: rows });
      }

      if (searchQ) {
        const pat = `%${searchQ}%`;
        const { results } = await db.prepare(`
          SELECT c.id, c.role, c.content, c.created_at, c.user_id,
                 u.real_name, u.name
          FROM conversations c LEFT JOIN users u ON c.user_id = u.id
          WHERE c.room_id = ? AND c.content LIKE ?
          ORDER BY c.created_at DESC LIMIT 100
        `).bind(roomId, pat).all();
        return Response.json({ matches: results || [], query: searchQ });
      }

      // 방 정보
      const room = await db.prepare(`SELECT * FROM chat_rooms WHERE id = ?`).bind(roomId).first();
      if (!room) return Response.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });

      /* 이 사용자의 visible_since (과거 대화 공개 시점) 조회 — 초대 시 설정 가능 */
      try { await db.prepare(`ALTER TABLE room_members ADD COLUMN visible_since TEXT`).run(); } catch {}
      let myVisibleSince = null;
      try {
        const me = await db.prepare(
          `SELECT visible_since FROM room_members WHERE room_id = ? AND user_id = ?`
        ).bind(roomId, user.user_id).first();
        if (me && me.visible_since) myVisibleSince = me.visible_since;
      } catch {}

      // 멤버 목록 (이름만)
      const { results: members } = await db.prepare(`
        SELECT rm.user_id, rm.role, u.real_name, u.name, u.profile_image
        FROM room_members rm
        LEFT JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ? AND rm.left_at IS NULL
        ORDER BY rm.joined_at ASC
      `).bind(roomId).all();

      // 메시지 + unread_count (카톡 "1" 시스템)
      let query = `
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
      `;
      const binds = [roomId];
      if (since) { query += ` AND c.created_at > ?`; binds.push(since); }
      /* visible_since: 이 사용자가 초대된 시점 이전 메시지는 숨김 */
      if (myVisibleSince) { query += ` AND c.created_at >= ?`; binds.push(myVisibleSince); }
      query += ` ORDER BY c.created_at ASC LIMIT 500`;

      const { results: messages } = await db.prepare(query).bind(...binds).all();

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
                    category, category_src, status, note, created_at
             FROM documents WHERE id IN (${placeholders})
               AND (room_id = ? OR user_id IN (SELECT user_id FROM room_members WHERE room_id = ?))`
          ).bind(...docIds, roomId, roomId).all();
          /* 보안 (2026-11-19 점검 C2): 이 방 것(이 방에 올렸거나 방 멤버가 올린 것)만 붙인다 —
             다른 거래처 영수증 번호를 적어 보내 내용을 빼 보는 것 차단 */
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
      } catch (e) { /* 실패해도 기본 메시지는 보여줌 */ }

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

    /* 🚨 보안 필터: 현재 is_admin=1 인 유저일 때만 role='admin' 방 숨김.
       과거 관리자였다가 강등된 유저(users.is_admin=0) 는 room_members.role 이
       'admin' 으로 남아있어도 정상 노출. 데이터 불일치 방어 + 기장거래처 복귀 대응. */
    const hideAdminRooms = user.is_admin ? `AND rm.role != 'admin'` : '';
    const { results } = await db.prepare(`
      SELECT r.id, r.name, r.status, r.ai_mode, r.created_at,
             (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND left_at IS NULL) as member_count,
             (SELECT MAX(created_at) FROM conversations WHERE room_id = r.id) as last_msg_at,
             (SELECT content FROM conversations WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_msg,
             (SELECT COUNT(*) FROM conversations c
              WHERE c.room_id = r.id
                AND c.created_at > COALESCE(rm.last_read_at, '1970-01-01')
                AND (c.user_id IS NULL OR c.user_id != ?) ) as unread_count,
             rm.last_read_at
      FROM chat_rooms r
      INNER JOIN room_members rm ON rm.room_id = r.id
      WHERE rm.user_id = ? AND rm.left_at IS NULL
        ${hideAdminRooms}
        AND COALESCE(r.status, 'active') = 'active'  -- 종료(closed)·내부(internal) 숨김
        AND COALESCE(r.is_internal, 0) = 0
      ORDER BY last_msg_at DESC NULLS LAST, r.created_at DESC
      LIMIT 50
    `).bind(user.user_id, user.user_id).all();

    return Response.json({ rooms: results || [] });
  } catch (e) {
    /* 보안: 내부 에러 미노출 */
    return Response.json({ error: "요청 처리 실패" }, { status: 500 });
  }
}

// POST: 메시지 전송 or 나가기
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });
  /* 거래 종료된 사용자는 상담방 접근 전면 차단 (대화 열람·전송 모두 X) */
  if (user.approval_status === 'terminated') {
    return Response.json({ error: "거래가 종료되어 상담방을 이용하실 수 없습니다.\n재문의는 카카오톡 채널 또는 053-269-1213 으로 연락해주세요.", terminated: true }, { status: 403 });
  }

  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get("action") || "send";

  try {
    const body = await context.request.json();

    // ── 상담방 생성 차단 (정책 변경: 모든 상담방은 관리자만 생성) ──
    if (action === "create") {
      return Response.json({ error: "상담방은 관리자(세무사)만 만들 수 있습니다. 업체 등록 요청을 통해 문의해 주세요." }, { status: 403 });
    }

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

    // ── 메시지 삭제 (본인 메시지만, 5분 이내) ──
    if (action === "delete_message") {
      try { await db.prepare(`ALTER TABLE conversations ADD COLUMN deleted_at TEXT`).run(); } catch {}
      const messageId = Number(body.message_id);
      if (!messageId) return Response.json({ error: "message_id required" }, { status: 400 });
      const msg = await db.prepare(
        `SELECT id, user_id, role, created_at, deleted_at FROM conversations WHERE id = ? AND room_id = ?`
      ).bind(messageId, roomId).first();
      if (!msg) return Response.json({ error: "메시지 없음" }, { status: 404 });
      if (msg.user_id !== user.user_id || msg.role !== 'user') {
        return Response.json({ error: "본인 메시지만 삭제 가능합니다" }, { status: 403 });
      }
      // 5분 이내 삭제만 허용
      const createdMs = Date.parse(msg.created_at.replace(' ', 'T'));
      if (!isNaN(createdMs) && Date.now() - createdMs > 5 * 60 * 1000) {
        return Response.json({ error: "전송 후 5분이 지나 삭제할 수 없습니다" }, { status: 400 });
      }
      await db.prepare(`UPDATE conversations SET deleted_at = ? WHERE id = ?`).bind(kst(), messageId).run();
      return Response.json({ ok: true });
    }

    // ── 메시지 전송 ──
    if (action === "send") {
      if (room.status !== 'active') {
        return Response.json({ error: "종료된 방입니다" }, { status: 403 });
      }
      const rawContent = (body.content || "").trim();
      const imageUrl = (body.image_url || "").trim();
      const fileUrl = (body.file_url || "").trim();
      const fileName = (body.file_name || "").trim();
      const fileSize = Number(body.file_size || 0);
      if (!rawContent && !imageUrl && !fileUrl) return Response.json({ error: "content or image_url or file_url required" }, { status: 400 });
      if (rawContent.length > 3000) return Response.json({ error: "메시지가 너무 깁니다" }, { status: 400 });
      const clean = rawContent ? sanitizeUserMessage(rawContent) : { content: '' };
      if (clean.error) return Response.json({ error: clean.error }, { status: 400 });
      const content = clean.content;

      /* 보안: image_url / file_url은 우리 R2 프록시 경로만 허용.
         javascript:, data:, 외부 도메인 주입 차단.
         Phase R6 (2026-05-05 사장님 보고: "허용되지 않은 file_url"):
         name 파라미터는 한글·공백 등 다양 → URL encoded form 까지 허용.
         핵심은 path 가 /api/(image|file)?k=... 인지. */
      /* 사진 주소는 업로드가 돌려준 모양 그대로(/api/image?k=키)만 — 뒤에 다른 값을 붙여 따옴표·괄호를 넣는 것 차단 (2026-11-19) */
      const isSafeImageUrl = (u) => /^\/api\/image\?k=[A-Za-z0-9%._\-\/]+$/.test(u);
      const isSafeFileUrl  = (u) => /^\/api\/file\?k=[A-Za-z0-9%._\-\/]+(&[A-Za-z_]+=[^&"<>]*)*$/.test(u);
      if (imageUrl && !isSafeImageUrl(imageUrl)) {
        return Response.json({ error: '허용되지 않은 image_url' }, { status: 400 });
      }
      if (fileUrl && !isSafeFileUrl(fileUrl)) {
        return Response.json({ error: '허용되지 않은 file_url' }, { status: 400 });
      }
      /* 파일명: 경로 구분자·제어문자 금지 (렌더링 시 XSS는 esc로 처리됨) */
      if (fileName && /[\r\n\t\\\/\x00-\x1f"<>]/.test(fileName)) {
        return Response.json({ error: '파일명에 금지된 문자가 있습니다' }, { status: 400 });
      }
      if (fileName.length > 200) {
        return Response.json({ error: '파일명이 너무 깁니다' }, { status: 400 });
      }
      if (fileSize < 0 || fileSize > 500 * 1024 * 1024) {
        return Response.json({ error: 'file_size 범위 초과' }, { status: 400 });
      }

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
        VALUES (?, ?, 'user', ?, ?, ?)
      `).bind('room_' + roomId, user.user_id, finalContent, roomId, now).run();

      // 푸시 알림: 방 다른 멤버 + 세무사(admin) 모두에게
      try {
        const _webpush = await import("./_webpush.js");
        const roomMeta = await db.prepare(`SELECT name FROM chat_rooms WHERE id = ?`).bind(roomId).first();
        const senderName = (await db.prepare(`SELECT real_name, name FROM users WHERE id = ?`).bind(user.user_id).first());
        const senderLabel = senderName?.real_name || senderName?.name || '고객';
        const bodyText = fileUrl ? '📁 파일' : imageUrl ? '📷 사진' : content.slice(0, 80);
        const { results: others } = await db.prepare(
          `SELECT DISTINCT m.user_id FROM room_members m
           WHERE m.room_id = ? AND m.left_at IS NULL AND m.user_id != ? AND m.user_id IS NOT NULL`
        ).bind(roomId, user.user_id).all();
        // 방 멤버 + is_admin=1 인 관리자들 전원에게 (세무사 푸시)
        const { results: admins } = await db.prepare(
          `SELECT id as user_id FROM users WHERE is_admin = 1 AND id != ?`
        ).bind(user.user_id).all();
        const targetIds = new Set();
        for (const m of (others || [])) targetIds.add(m.user_id);
        for (const a of (admins || [])) targetIds.add(a.user_id);
        for (const uid of targetIds) {
          await _webpush.notifyUser(db, context.env, uid, {
            title: '💬 ' + (roomMeta?.name || '상담방'),
            body: senderLabel + ': ' + bodyText,
            tag: 'room-' + roomId,
            url: '/?room=' + roomId,
          });
        }
      } catch (e) { /* push 실패는 무시 */ }

      // 내 last_read_at 갱신
      await db.prepare(
        `UPDATE room_members SET last_read_at = ? WHERE room_id = ? AND user_id = ?`
      ).bind(now, roomId, user.user_id).run();

      return Response.json({ ok: true, room_ai_mode: room.ai_mode });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    /* 보안: 내부 에러 미노출 */
    return Response.json({ error: "요청 처리 실패" }, { status: 500 });
  }
}
