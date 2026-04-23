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
    max_members INTEGER DEFAULT 10,
    ai_mode TEXT DEFAULT 'on',
    status TEXT DEFAULT 'active',
    created_at TEXT,
    closed_at TEXT
  )`).run();
  /* 내부 실무 요약 저장 (재조회·이력·비용 절감) */
  await db.prepare(`CREATE TABLE IF NOT EXISTS room_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    range_type TEXT NOT NULL,
    range_start TEXT,
    range_end TEXT,
    source_message_count INTEGER DEFAULT 0,
    source_memo_count INTEGER DEFAULT 0,
    generated_at TEXT NOT NULL,
    generated_by TEXT,
    summary_text TEXT,
    summary_json TEXT,
    cost_cents REAL DEFAULT 0
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_room_summaries_room ON room_summaries(room_id, generated_at DESC)`).run(); } catch {}
  /* 담당자 내부 메모 (요약 재료) */
  await db.prepare(`CREATE TABLE IF NOT EXISTS memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    author_user_id INTEGER,
    author_name TEXT,
    memo_type TEXT DEFAULT '사실메모',
    content TEXT NOT NULL,
    visibility TEXT DEFAULT 'internal',
    is_edited INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_room ON memos(room_id, created_at DESC)`).run(); } catch {}
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
  /* 기존 방 max_members 최소 10 으로 상향 — 관리자 자동 참여 후 공간 부족 방지 */
  try { await db.prepare(`UPDATE chat_rooms SET max_members = 10 WHERE max_members < 10`).run(); } catch {}
  /* 🏢 업체 연결 컬럼 + 업체 테이블 미리 보장 (JOIN 안전) */
  try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN business_id INTEGER`).run(); } catch {}
  /* 🔐 내부 업무방 플래그 — 관리자끼리만 쓰는 방 (거래처 노출 X) */
  try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN is_internal INTEGER DEFAULT 0`).run(); } catch {}
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      business_number TEXT,
      ceo_name TEXT,
      industry TEXT,
      business_type TEXT,
      tax_type TEXT,
      establishment_date TEXT,
      address TEXT,
      phone TEXT,
      employee_count INTEGER,
      last_revenue INTEGER,
      vat_period TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      source_client_business_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    )`).run();
  } catch {}
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
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
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
  if (action === "summary_history") {
    return await loadSummaryHistory(context, db, url.searchParams.get("room_id"));
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
      /* 관리자(직원 세션) 본인이 열었으니 last_read_at 갱신 → 카톡 "1" 시스템 동기화 */
      if (auth && auth.userId) {
        try {
          const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
          await db.prepare(
            `UPDATE room_members SET last_read_at = ? WHERE room_id = ? AND user_id = ?`
          ).bind(now, roomId, auth.userId).run();
        } catch {}
      }

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

    /* business_id 컬럼·businesses 테이블이 아직 없어도 LEFT JOIN 이 NULL 로 떨어져 안전.
       과거 배포 환경에서 ALTER 누락되지 않도록 방어적으로 시도 */
    try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN business_id INTEGER`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN is_internal INTEGER DEFAULT 0`).run(); } catch {}
    /* 🔐 internal=1 이면 관리자방만, 기본은 외부 상담방만 */
    const internalMode = url.searchParams.get('internal') === '1';
    // 목록 — priority 먼저, 최근순. 카톡 스타일 미리보기·아바타·업체명 포함
    const { results } = await db.prepare(`
      SELECT r.*,
             b.company_name AS business_name,
             (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND left_at IS NULL) as member_count,
             (SELECT COUNT(*) FROM conversations WHERE room_id = r.id) as msg_count,
             (SELECT COUNT(*) FROM conversations WHERE room_id = r.id AND role = 'user') as user_msg_count,
             (SELECT COUNT(*) FROM conversations WHERE room_id = r.id AND role != 'human_advisor') as non_advisor_msg_count,
             (SELECT MAX(created_at) FROM conversations WHERE room_id = r.id AND role = 'user') as last_user_msg_at,
             (SELECT MAX(created_at) FROM conversations WHERE room_id = r.id) as last_msg_at,
             (SELECT content FROM conversations WHERE room_id = r.id AND (deleted_at IS NULL) ORDER BY created_at DESC LIMIT 1) as last_msg_content,
             (SELECT role    FROM conversations WHERE room_id = r.id AND (deleted_at IS NULL) ORDER BY created_at DESC LIMIT 1) as last_msg_role
      FROM chat_rooms r
      LEFT JOIN businesses b ON r.business_id = b.id
      WHERE COALESCE(r.is_internal, 0) = ?
      ORDER BY r.status ASC,
               COALESCE(r.priority, 99) ASC,
               last_msg_at DESC NULLS LAST,
               r.created_at DESC
      LIMIT 200
    `).bind(internalMode ? 1 : 0).all();

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
      const maxMembers = Math.min(Math.max(Number(body.max_members) || 10, 2), 10);
      const memberIds = Array.isArray(body.member_user_ids) ? body.member_user_ids : [];

      // 6자리 ID 생성 (중복 회피)
      let roomId;
      for (let i = 0; i < 20; i++) {
        roomId = genRoomId();
        const exists = await db.prepare(`SELECT id FROM chat_rooms WHERE id = ?`).bind(roomId).first();
        if (!exists) break;
      }

      const isInternal = body.is_internal ? 1 : 0;
      await db.prepare(`
        INSERT INTO chat_rooms (id, name, created_by_admin, max_members, ai_mode, status, is_internal, created_at)
        VALUES (?, ?, 1, ?, 'on', 'active', ?, ?)
      `).bind(roomId, name, maxMembers, isInternal, now).run();

      // 거래처 멤버 추가 (방 생성 UI에서 선택한 거래처 사장들)
      for (const uid of memberIds) {
        try {
          await db.prepare(`
            INSERT INTO room_members (room_id, user_id, role, joined_at)
            VALUES (?, ?, 'member', ?)
          `).bind(roomId, Number(uid), now).run();
        } catch {}
      }

      // 관리자(is_admin=1) 전원 자동 참여 — 카톡 그룹방 스타일.
      // 관리자 N명이 방에 들어와 있으면 unread 카운트도 안 읽은 관리자 수만큼 커짐.
      try {
        const { results: adminRows } = await db.prepare(
          `SELECT id FROM users WHERE is_admin = 1`
        ).all();
        for (const a of (adminRows || [])) {
          try {
            await db.prepare(`
              INSERT INTO room_members (room_id, user_id, role, joined_at)
              VALUES (?, ?, 'admin', ?)
            `).bind(roomId, Number(a.id), now).run();
          } catch {}
        }
      } catch {}

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

      /* visible_since 옵션 — 이 사용자가 볼 수 있는 과거 메시지 시작점.
         null: 전체 공개 (기본, 과거 대화 모두 열람 가능)
         'now': 현재 초대 시각으로 설정 → 이후 메시지만 공개
         'YYYY-MM-DD' 또는 'YYYY-MM-DD HH:MM:SS': 해당 시각 이후만 공개 */
      try { await db.prepare(`ALTER TABLE room_members ADD COLUMN visible_since TEXT`).run(); } catch {}
      let visibleSince = null;
      const vsRaw = body.visible_since;
      if (vsRaw === 'now' || vsRaw === true) {
        visibleSince = now;
      } else if (typeof vsRaw === 'string' && vsRaw.trim()) {
        const t = vsRaw.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(t)) visibleSince = t + ' 00:00:00';
        else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(t)) visibleSince = t.replace('T', ' ').slice(0, 19);
        /* 잘못된 포맷이면 null (= 전체 공개) 로 fallback */
      }

      /* ON CONFLICT 로 기존 행 복구 시 visible_since·role 도 같이 업데이트 */
      await db.prepare(`
        INSERT INTO room_members (room_id, user_id, role, joined_at, visible_since)
        VALUES (?, ?, 'member', ?, ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET
          left_at = NULL,
          visible_since = excluded.visible_since,
          role = CASE WHEN room_members.role = 'admin' THEN 'admin' ELSE excluded.role END
      `).bind(roomId, userId, now, visibleSince).run();
      return Response.json({ ok: true, visible_since: visibleSince });
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

    /* 🏢 업체 연결 — 이 상담방을 어느 업체(businesses.id) 에 묶을지 지정.
       business_id=null 로 보내면 연결 해제 */
    if (action === "link_business") {
      try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN business_id INTEGER`).run(); } catch {}
      const raw = body.business_id;
      let bid = null;
      if (raw !== null && raw !== undefined && raw !== '') {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) return Response.json({ error: 'business_id 는 양수 또는 null' }, { status: 400 });
        const chk = await db.prepare(`SELECT id FROM businesses WHERE id = ?`).bind(n).first();
        if (!chk) return Response.json({ error: 'business 없음' }, { status: 404 });
        bid = n;
      }
      await db.prepare(`UPDATE chat_rooms SET business_id = ? WHERE id = ?`).bind(bid, roomId).run();
      return Response.json({ ok: true, business_id: bid });
    }

    /* 우선순위 지정 (1/2/3 또는 NULL) */
    if (action === "set_priority") {
      const raw = body.priority;
      let p = null;
      if (raw !== null && raw !== undefined && raw !== '') {
        const n = Number(raw);
        /* room_labels.id 로 유효성 체크 (1~N 까지 관리자 임의 생성 가능) */
        if (!Number.isInteger(n) || n <= 0) {
          return Response.json({ error: 'priority 는 label id (양수) 또는 null' }, { status: 400 });
        }
        try {
          const chk = await db.prepare(`SELECT id FROM room_labels WHERE id = ?`).bind(n).first();
          if (!chk) return Response.json({ error: '존재하지 않는 담당자 라벨 id: ' + n }, { status: 400 });
          p = n;
        } catch {
          /* room_labels 테이블 없으면 1/2/3 만 허용 (마이그레이션 전) */
          if (n === 1 || n === 2 || n === 3) p = n;
          else return Response.json({ error: '라벨 테이블이 아직 없음' }, { status: 400 });
        }
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
      /* 관리자 본인 식별: auth.userId 있으면(직원 로그인) 저장, owner(ADMIN_KEY)면 NULL
         → unread_count 계산 시 본인 제외 가능 + last_read_at 갱신 가능 */
      const actorUid = auth.userId || null;
      await db.prepare(`
        INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
        VALUES (?, ?, 'human_advisor', ?, ?, ?)
      `).bind('room_' + roomId, actorUid, finalContent, roomId, now).run();
      /* 본인 메시지니 본인 last_read_at 갱신 */
      if (actorUid) {
        try { await db.prepare(
          `UPDATE room_members SET last_read_at = ? WHERE room_id = ? AND user_id = ?`
        ).bind(now, roomId, actorUid).run(); } catch {}
      }

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
    /* 상담방 영구 삭제 — DELETE 메서드 막히는 프록시 대비 POST 경로 */
    if (action === "delete_room") {
      if (!auth.owner) return ownerOnly();
      try {
        await db.prepare(`DELETE FROM conversations WHERE room_id = ?`).bind(roomId).run();
        await db.prepare(`DELETE FROM room_members WHERE room_id = ?`).bind(roomId).run();
        try { await db.prepare(`DELETE FROM room_notices WHERE room_id = ?`).bind(roomId).run(); } catch {}
        try { await db.prepare(`DELETE FROM room_summaries WHERE room_id = ?`).bind(roomId).run(); } catch {}
        try { await db.prepare(`DELETE FROM memos WHERE room_id = ?`).bind(roomId).run(); } catch {}
        await db.prepare(`DELETE FROM chat_rooms WHERE id = ?`).bind(roomId).run();
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

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
    query = `SELECT c.id, c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
             FROM conversations c LEFT JOIN users u ON c.user_id = u.id
             WHERE c.room_id = ?
             ORDER BY c.created_at DESC LIMIT 50`;
    binds = [roomId];
  } else if (range === 'week') {
    query = `SELECT c.id, c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
             FROM conversations c LEFT JOIN users u ON c.user_id = u.id
             WHERE c.room_id = ? AND datetime(c.created_at) >= datetime('now','-7 days')
             ORDER BY c.created_at DESC LIMIT 300`;
    binds = [roomId];
  } else if (range === 'month') {
    const ym = new Date(Date.now()+9*60*60*1000).toISOString().substring(0,7);
    query = `SELECT c.id, c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
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
    query = `SELECT c.id, c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
             FROM conversations c LEFT JOIN users u ON c.user_id = u.id
             WHERE c.room_id = ? AND substr(c.created_at,1,10) >= ? AND substr(c.created_at,1,10) <= ?
             ORDER BY c.created_at DESC LIMIT 1000`;
    binds = [roomId, fromDate, toDate];
  } else { // all
    query = `SELECT c.id, c.role, c.content, c.created_at, u.real_name, u.name, c.deleted_at
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

  // [DOC:id] 상세 한 번에 조회 — 자료 업로드 "숫자 요약" + 주요 건 Top 5 만
  const docIds = [];
  let imgCount = 0, fileCount = 0;
  for (const m of chrono) {
    const s = String(m.content || '');
    const mm = /^\[DOC:(\d+)\]/.exec(s);
    if (mm) docIds.push(parseInt(mm[1], 10));
    else if (/^\[IMG\]/.test(s)) imgCount++;
    else if (/^\[FILE\]/.test(s)) fileCount++;
  }
  const docMap = {};
  const docTypeCounts = {};
  const topDocs = [];
  if (docIds.length) {
    try {
      const placeholders = docIds.map(() => '?').join(',');
      const { results: docRows } = await db.prepare(
        `SELECT id, doc_type, vendor, amount, receipt_date FROM documents WHERE id IN (${placeholders})`
      ).bind(...docIds).all();
      const typeLabel = {
        receipt: '영수증', lease: '임대차', payroll: '근로(4대보험)', freelancer_payment: '프리랜서(3.3%)',
        tax_invoice: '세금계산서', insurance: '보험', utility: '공과금', property_tax: '지방세',
        bank_stmt: '은행내역', business_reg: '사업자등록증', identity: '신분증', contract: '계약서',
        other: '기타문서',
      };
      for (const d of (docRows || [])) {
        const typ = typeLabel[d.doc_type] || d.doc_type || '문서';
        docTypeCounts[typ] = (docTypeCounts[typ] || 0) + 1;
        const amt = d.amount ? Number(d.amount).toLocaleString('ko-KR') + '원' : '';
        const dt = (d.receipt_date || '').substring(0, 10);
        const parts = [typ];
        if (d.vendor) parts.push(d.vendor);
        if (amt) parts.push(amt);
        if (dt) parts.push(dt);
        docMap[d.id] = parts.join(' · ');
        /* 금액 큰 순 Top 5 선별용 */
        topDocs.push({ id: d.id, type: typ, vendor: d.vendor || '', amount: Number(d.amount || 0), date: dt });
      }
      topDocs.sort((a, b) => b.amount - a.amount);
    } catch {/* 문서 조회 실패해도 요약은 계속 */}
  }
  /* 자료 업로드 숫자 요약 문자열 (프롬프트 주입용) */
  const docSummaryParts = [];
  for (const k of Object.keys(docTypeCounts)) docSummaryParts.push(`${k} ${docTypeCounts[k]}건`);
  if (imgCount > 0) docSummaryParts.push(`사진 ${imgCount}건`);
  if (fileCount > 0) docSummaryParts.push(`파일 ${fileCount}건`);
  const docUploadSummary = docSummaryParts.length ? docSummaryParts.join(' · ') : '(업로드 없음)';
  const top5Str = topDocs.slice(0, 5).filter(t => t.amount > 0).map(t => {
    const bits = [t.type];
    if (t.vendor) bits.push(t.vendor);
    bits.push(t.amount.toLocaleString('ko-KR') + '원');
    if (t.date) bits.push(t.date);
    return '  · ' + bits.join(' · ');
  }).join('\n');

  // 컨텐츠 축약 (특수 프리픽스 제거·단축)
  const lines = [];
  const msgIdMap = []; // 요약 프롬프트 라인 → 원본 메시지 id 매핑 (Phase 4용)
  for (const m of chrono) {
    if (m.deleted_at) continue;
    let content = (m.content || "").trim();
    if (!content) continue;
    // [IMG]/[FILE]/[DOC:id]/[REPLY]/[ALERT] 축약
    if (/^\[IMG\]/.test(content)) content = "(사진 전송)";
    else if (/^\[FILE\]/.test(content)) content = "(파일 전송)";
    else {
      const dm = /^\[DOC:(\d+)\]/.exec(content);
      if (dm) {
        /* 대화 라인에서는 타입만 노출 — 개별 나열로 요약이 너저분해지는 문제 방지.
           상세 요약은 별도 "자료 업로드 요약" 블록에서 숫자로 집계됨 */
        const docInfo = docMap[parseInt(dm[1], 10)];
        const typeOnly = docInfo ? docInfo.split(' · ')[0] : '문서';
        content = `(${typeOnly} 업로드)`;
      } else if (/^\[ALERT\]/.test(content)) {
        try { const a = JSON.parse(content.replace(/^\[ALERT\]/, '')); content = `[시스템 알림] ${a.t || ''}: ${a.m || ''}`; } catch { content = "(알림)"; }
      }
      else if (/^\[REPLY\]/.test(content)) {
        const mm2 = /^\[REPLY\]\{[^\n]+\}\n([\s\S]*)$/.exec(content);
        if (mm2) content = mm2[1];
      }
    }
    if (content.length > 500) content = content.substring(0, 500) + "…";
    const who = m.role === 'assistant' ? '🤖 AI'
              : m.role === 'human_advisor' ? '👨‍💼 세무사'
              : '👤 ' + (m.real_name || m.name || '고객');
    const t = (m.created_at || '').substring(0, 16);
    const msgIdTag = m.id ? `#${m.id}` : '';
    lines.push(`[${t}]${msgIdTag} ${who}: ${content}`);
    if (m.id) msgIdMap.push(m.id);
  }

  if (!lines.length) return Response.json({ ok: true, summary: "(대화 내용이 없습니다)", message_count: 0 });

  const conversation = lines.join('\n');
  /* 실제 대화의 첫·마지막 시점 (non-deleted 기준) */
  const firstAt = (chrono.find(m => !m.deleted_at)?.created_at || '').substring(0,16);
  const lastAt = ([...chrono].reverse().find(m => !m.deleted_at)?.created_at || '').substring(0,16);

  /* 대표 고객명 힌트 (첫 번째 user role 이름) */
  const customerName = (chrono.find(m => m.role === 'user' && (m.real_name || m.name))?.real_name
                     || chrono.find(m => m.role === 'user' && (m.real_name || m.name))?.name
                     || '고객');

  /* 방의 고객 user_id 찾기 — 거래처 정보 영구 메모 조회용 */
  let customerUserId = null;
  try {
    const r = await db.prepare(
      `SELECT user_id FROM room_members
       WHERE room_id = ? AND left_at IS NULL AND user_id IS NOT NULL AND role != 'admin'
       ORDER BY joined_at ASC LIMIT 1`
    ).bind(roomId).first();
    customerUserId = r?.user_id || null;
  } catch {}

  /* 거래처 정보 메모 (영구, user_id 기반) — 인수인계·기본사항.
     AI 요약 상단 "거래처 기본 정보" 블록으로 주입 */
  let customerInfoBlock = '(등록된 기본 정보 없음)';
  if (customerUserId) {
    try {
      const { results: cinfoRows } = await db.prepare(
        `SELECT content, author_name, created_at FROM memos
         WHERE target_user_id = ? AND memo_type = '거래처 정보' AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT 20`
      ).bind(customerUserId).all();
      if (cinfoRows && cinfoRows.length) {
        customerInfoBlock = cinfoRows.map(m => {
          const t = (m.created_at || '').substring(0, 10);
          const by = m.author_name ? `(${m.author_name})` : '';
          return `- ${by} ${t}: ${String(m.content || '').slice(0, 400)}`;
        }).join('\n');
      }
    } catch {}
  }

  /* 담당자 메모 블록 (memos 테이블 기반, 방 단위).
     신 타입: 할 일/완료/거래처 정보. 구 타입은 매핑 테이블로 정규화.
     거래처 정보는 위에서 별도 블록으로 주입하므로 여기선 방 단위 메모만 */
  let memoBlock = '(없음)';
  try {
    const { results: memoRows } = await db.prepare(
      `SELECT id, memo_type, content, author_name, created_at, is_edited, due_date, linked_message_id
         FROM memos
        WHERE room_id = ? AND deleted_at IS NULL
          AND memo_type != '거래처 정보'
        ORDER BY created_at ASC LIMIT 80`
    ).bind(roomId).all();
    if (memoRows && memoRows.length) {
      const LEGACY_MAP = {
        '사실메모': '거래처 정보', '확인필요': '할 일', '고객요청': '할 일',
        '담당자판단': '거래처 정보', '주의사항': '거래처 정보', '완료처리': '완료',
        '참고': '거래처 정보',
      };
      const normType = (t) => LEGACY_MAP[t] || t || '할 일';
      memoBlock = memoRows.map(m => {
        const t = (m.created_at || '').substring(5, 16);
        const typ = normType(m.memo_type);
        const by = m.author_name ? `(${m.author_name})` : '';
        const due = m.due_date ? ` 📅${m.due_date}` : '';
        const link = m.linked_message_id ? ` 🔗#${m.linked_message_id}` : '';
        const edited = m.is_edited ? ' *수정됨' : '';
        return `- [${typ}]${due}${link} ${by} ${t}${edited}: ${String(m.content || '').slice(0, 400)}`;
      }).join('\n');
    }
  } catch { /* memos 테이블 아직 없으면 조용히 무시 */ }

  /* 내부 실무 정리형 프롬프트 — 담당자가 바로 체크리스트로 쓸 수 있게.
     JSON + MARKDOWN 이중 출력: JSON 은 섹션 카드 렌더/저장용, MD 는 하위 호환용. */
  const prompt = `당신은 세무회계 사무실의 내부 업무 보조자이다.
아래 상담방 대화와 담당자 메모를 읽고, 담당자가 바로 실무 처리할 수 있도록 내부용 정리표를 작성한다.

원칙:
- 고객 응대 문체 금지. 서술형 문단 금지. 짧은 명사형·항목형으로.
- 감성적 수식어·인사말 금지.
- 확정된 사실과 추정·확인 필요 항목을 분리.
- 자료 업로드 섹션은 **개별 나열 금지**. 제공된 "자료 업로드 요약" 블록의 숫자를 그대로 옮기고, 금액 큰 Top 항목만 1~3개 언급. 대화 라인의 "(영수증 업로드)" 개별 카운트 X.
- "거래처 기본 정보" 블록이 제공되면 **상담 개요·확정 사실 섹션 상단**에 반드시 한두 줄로 녹인다 (업종·특이사항·고정 패턴 등).
- 담당자 메모 반영: [할 일] → "다음 액션" 에 포함 (기한 표기). [거래처 정보] → 위 블록으로 대체됨. [완료] → "이미 처리됨" 으로 확정사실에.
- 대화에 근거 없는 내용은 만들지 말 것 (할루시네이션 금지).
- 날짜가 있으면 YYYY-MM-DD 로 포함.
- 각 항목 끝에 근거 메시지 ID 를 "(#123)" 또는 "(#123, #124)" 형태로 붙인다. 메모 근거면 "(memo)" 로 표시.

출력은 **정확히 아래 두 블록만** 순서대로:

=== JSON ===
{
  "overview": {
    "period": "YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM",
    "messageCount": 정수,
    "customerName": "고객명",
    "purpose": "이번 상담의 주된 목적 한 줄"
  },
  "confirmedFacts": [{"text": "짧은 항목", "msgIds": [123, 124]}],
  "customerRequests": [{"text": "짧은 항목", "msgIds": [123]}],
  "uploadedMaterials": [{"text": "YYYY-MM-DD: 영수증 N건", "msgIds": [125]}],
  "needCheck": [{"text": "짧은 항목", "msgIds": [126]}],
  "nextActions": [{"text": "짧은 항목", "msgIds": []}],
  "risks": [{"text": "짧은 항목", "msgIds": []}]
}
각 배열은 객체 {text, msgIds} 형태. msgIds 는 근거 메시지 번호(#숫자)만 (메모는 제외). 근거 없으면 [].
=== MARKDOWN ===
## ⏱ 상담 시점
${firstAt} ~ ${lastAt} (총 ${lines.length}건)

## 상담 개요
- 기간: ...
- 메시지 수: ${lines.length}건
- 고객: ...
- 상담 목적: ...

## 확정된 핵심 사실
- ...

## 고객 요청 / 질문
- ...

## 자료 업로드 / 제출 흐름
- ...

## 확인 필요 사항
- ...

## 다음 액션
- ...

## 특이사항 / 주의사항
- ...

내용이 없는 섹션은 "- 없음"으로 표시.

---컨텍스트---
- 대화 첫 메시지: ${firstAt}
- 대화 마지막 메시지: ${lastAt}
- 메시지 수: ${lines.length}
- 추정 고객: ${customerName}

---거래처 기본 정보 (영구·인수인계용) — 이 거래처의 업종·특이사항·고정 패턴 등---
${customerInfoBlock}

---자료 업로드 요약 (이 기간 내 집계)---
${docUploadSummary}${top5Str ? '\n주요 건(금액 큰 순 Top5):\n' + top5Str : ''}

---담당자 메모 (방 단위, 내부 전용) — 각 줄 형식: [타입] 📅기한 🔗#연결메시지 (작성자) 시각: 내용---
${memoBlock}

---대화 기록 (각 줄 형식: [HH:MM]#msgId 역할: 내용)---
${conversation}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1400,
        temperature: 0.2,
        messages: [
          { role: 'system', content: '세무사무실 내부 업무 보조. 내부용 실무 정리표 작성. 고객 공개용 아님. 대화 근거 없이 추측 금지.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const d = await res.json();
    if (!res.ok) return Response.json({ error: d?.error?.message || 'OpenAI error' }, { status: 500 });
    const raw = d.choices?.[0]?.message?.content || '';

    /* JSON + MARKDOWN 분리. 실패해도 마크다운 폴백으로 동작. */
    let summaryJson = null;
    let summaryMd = raw;
    const jsonMatch = raw.match(/===\s*JSON\s*===\s*([\s\S]*?)\s*===\s*MARKDOWN\s*===/i);
    const mdMatch = raw.match(/===\s*MARKDOWN\s*===\s*([\s\S]*)$/i);
    if (jsonMatch) {
      try { summaryJson = JSON.parse(jsonMatch[1].trim()); } catch { summaryJson = null; }
    }
    if (mdMatch) summaryMd = mdMatch[1].trim();

    const usage = d.usage || {};
    const costCents = (usage.prompt_tokens || 0) * 0.15 / 10000 + (usage.completion_tokens || 0) * 0.60 / 10000;
    /* D1 에 저장 (이력·재조회·비용 집계용). 실패해도 응답은 진행. */
    let savedId = null;
    try {
      const memoCount = (memoBlock && memoBlock !== '(없음)') ? memoBlock.split('\n').length : 0;
      const r = await db.prepare(
        `INSERT INTO room_summaries
         (room_id, range_type, range_start, range_end, source_message_count, source_memo_count, generated_at, generated_by, summary_text, summary_json, cost_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        roomId, range, firstAt, lastAt,
        lines.length, memoCount, kst(), 'ai',
        summaryMd || raw, summaryJson ? JSON.stringify(summaryJson) : null,
        costCents
      ).run();
      savedId = r.meta?.last_row_id || null;
    } catch {/* 저장 실패 무시 — 화면엔 표시됨 */}
    return Response.json({
      ok: true,
      summary: summaryMd || raw,        // 기존 호환: 마크다운 텍스트 (runRoomSummary 에서 렌더)
      summary_json: summaryJson,        // 신규: 섹션 카드 렌더용 (없을 수 있음)
      summary_id: savedId,              // 신규: 저장된 행 id
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

/* 상담방 요약 이력 조회 */
async function loadSummaryHistory(context, db, roomId) {
  if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });
  try {
    const { results } = await db.prepare(
      `SELECT id, range_type, range_start, range_end, source_message_count, source_memo_count,
              generated_at, generated_by, summary_text, summary_json, cost_cents
       FROM room_summaries WHERE room_id = ? ORDER BY generated_at DESC LIMIT 50`
    ).bind(roomId).all();
    return Response.json({ ok: true, summaries: (results || []).map(r => ({
      ...r,
      summary_json: (function(){ try { return r.summary_json ? JSON.parse(r.summary_json) : null; } catch { return null; } })(),
    })) });
  } catch (e) {
    return Response.json({ ok: true, summaries: [] }); /* 테이블 없으면 빈 배열 */
  }
}
