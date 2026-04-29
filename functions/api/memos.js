// 상담방 담당자 메모 (내부 전용)
// - GET    /api/memos?room_id=X                → 방 메모 목록 (최신순)
// - POST   /api/memos                           → 생성 { room_id, memo_type, content, due_date?, linked_message_id? }
// - PATCH  /api/memos?id=N                      → 수정 { memo_type?, content?, due_date?, linked_message_id? }
// - DELETE /api/memos?id=N                      → soft delete
//
// 인증: checkAdmin (ADMIN_KEY 또는 스태프 세션)
// visibility: 'internal' 고정 (고객 공개 금지)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

/* 현재 공식 3종 + 구 6종 하위호환 모두 허용 */
const NEW_TYPES = ['할 일', '완료', '거래처 정보'];
const LEGACY_TYPES = ['사실메모', '확인필요', '고객요청', '담당자판단', '주의사항', '완료처리', '참고'];
const ALLOWED_TYPES = NEW_TYPES.concat(LEGACY_TYPES);
/* 구 타입 → 신 타입 매핑 */
const LEGACY_MAP = {
  '사실메모': '거래처 정보', '확인필요': '할 일', '고객요청': '할 일',
  '담당자판단': '거래처 정보', '주의사항': '거래처 정보', '완료처리': '완료',
  '참고': '거래처 정보',
};

/* 카테고리 5종 (사장님 명령: 메모 빡센 세팅) — 세무 워크플로 분류
   📞 전화 / 📁 문서 / ⚠️ 이슈 / 📅 약속 / 📝 일반
   memo_type 과 직교 — type 은 할 일/완료/거래처 정보, category 는 일의 성격 */
const ALLOWED_CATEGORIES = ['전화', '문서', '이슈', '약속', '일반', null];

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

/* content 안의 #해시태그 자동 추출. 한글·영문·숫자·언더스코어 매칭 */
function extractTags(content) {
  if (!content) return [];
  const matches = String(content).match(/#[\w가-힣]+/g) || [];
  const tags = matches.map(m => m.slice(1)).filter(Boolean);
  return Array.from(new Set(tags));  /* unique */
}

/* tags 입력값 (string|array|null) 을 JSON string 또는 null 로 정규화 + content 의 #태그 자동 머지 */
function normalizeTags(tagsInput, content) {
  let tags = [];
  if (Array.isArray(tagsInput)) tags = tagsInput;
  else if (typeof tagsInput === 'string' && tagsInput.trim()) {
    try { tags = JSON.parse(tagsInput); if (!Array.isArray(tags)) tags = []; }
    catch { tags = String(tagsInput).split(',').map(s=>s.trim()).filter(Boolean); }
  }
  /* content 의 #태그 머지 */
  const fromContent = extractTags(content);
  const merged = Array.from(new Set([...tags, ...fromContent].map(t => String(t).trim()).filter(Boolean)));
  return merged.length ? JSON.stringify(merged) : null;
}

/* attachments 입력값 (array of {key,name,size,mime}) → JSON string 또는 null */
function normalizeAttachments(input) {
  if (!input) return null;
  let arr = input;
  if (typeof input === 'string') {
    try { arr = JSON.parse(input); } catch { return null; }
  }
  if (!Array.isArray(arr)) return null;
  /* 각 항목 검증 + sanitize */
  const safe = arr.filter(a => a && typeof a === 'object' && a.key)
    .slice(0, 10)  /* max 10 첨부 */
    .map(a => ({
      key: String(a.key).slice(0, 200),
      name: String(a.name || '').slice(0, 200),
      size: Number(a.size) || 0,
      mime: String(a.mime || '').slice(0, 100),
    }));
  return safe.length ? JSON.stringify(safe) : null;
}

async function ensureTable(db) {
  /* 스키마:
     - room_id: 방별 메모 (NULL 가능 — 개인 일정·거래처 정보 메모)
     - target_user_id: 거래처 단위 영구 메모 (거래처 정보 타입 또는 특정 거래처 공통 할 일)
     - assigned_to_user_id: 담당자 (스태프, 할 일 분배)
     - filing_type/filing_period: 신고 건 태그 (B안에서 확장)
  */
  await db.prepare(`CREATE TABLE IF NOT EXISTS memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT,
    target_user_id INTEGER,
    author_user_id INTEGER,
    author_name TEXT,
    assigned_to_user_id INTEGER,
    memo_type TEXT DEFAULT '할 일',
    content TEXT NOT NULL,
    visibility TEXT DEFAULT 'internal',
    is_edited INTEGER DEFAULT 0,
    due_date TEXT,
    linked_message_id INTEGER,
    filing_type TEXT,
    filing_period TEXT,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_room ON memos(room_id, created_at DESC)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_assignee ON memos(assigned_to_user_id, due_date)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_target ON memos(target_user_id, memo_type)`).run(); } catch {}
  /* 구버전 테이블 — 컬럼 추가 시도 (없으면 skip) */
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN due_date TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN linked_message_id INTEGER`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN assigned_to_user_id INTEGER`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN target_user_id INTEGER`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN filing_type TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN filing_period TEXT`).run(); } catch {}
  /* 거래처(업체) 단위 영구 메모 — Phase 3 (사람 ⊃ 거래처 ⊃ 상담방) 계층 */
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN target_business_id INTEGER`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_target_biz ON memos(target_business_id, memo_type)`).run(); } catch {}
  /* 메모 빡센 세팅 (2026-04-29 사장님 명령): 카테고리 / 태그 / 첨부 */
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN category TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN tags TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN attachments TEXT`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_target_user_all ON memos(target_user_id, created_at DESC)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_category ON memos(category, created_at DESC)`).run(); } catch {}
}

function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function safeParseJson(str) {
  try { const v = JSON.parse(str); return v; } catch { return null; }
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const scope = url.searchParams.get("scope");  // 'my' 전체 할일 | 'customer_info' 거래처 영구메모 | 'trash_count'
  const roomId = url.searchParams.get("room_id");
  const userIdParam = Number(url.searchParams.get("user_id") || 0);

  /* === 휴지통 카운트 (deleted_at IS NOT NULL) === */
  if (scope === 'trash_count') {
    try {
      const r = await db.prepare(
        `SELECT COUNT(*) AS c FROM memos WHERE deleted_at IS NOT NULL`
      ).first();
      return Response.json({ ok: true, count: r?.c || 0 });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* === 거래처 정보 메모 (영구·user_id 기반) === */
  if (scope === 'customer_info') {
    if (!userIdParam) return Response.json({ error: "user_id required" }, { status: 400 });
    try {
      const { results } = await db.prepare(
        `SELECT id, target_user_id, author_user_id, author_name, memo_type, content, is_edited,
                due_date, linked_message_id, filing_type, filing_period, category, tags, attachments,
                created_at, updated_at
           FROM memos
          WHERE target_user_id = ? AND memo_type = '거래처 정보' AND deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 100`
      ).bind(userIdParam).all();
      return Response.json({ ok: true, memos: results || [], types: NEW_TYPES });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* === 거래처 통합 메모 (한 거래처의 모든 메모: 할 일+거래처 정보+완료) — 메모 빡센 세팅 ===
     사장님 명령: cdCustomerInfo 영역 통합 메모로. 카테고리·태그 필터 지원. */
  if (scope === 'customer_all') {
    if (!userIdParam) return Response.json({ error: "user_id required" }, { status: 400 });
    const category = url.searchParams.get('category');
    const tag = url.searchParams.get('tag');
    try {
      const where = [`target_user_id = ?`, `deleted_at IS NULL`];
      const binds = [userIdParam];
      if (category && ALLOWED_CATEGORIES.includes(category)) {
        where.push(`category = ?`); binds.push(category);
      }
      if (tag) {
        /* JSON LIKE — exact key match in array */
        where.push(`(tags IS NOT NULL AND (tags LIKE ? OR tags LIKE ? OR tags LIKE ? OR tags = ?))`);
        const tagStr = String(tag).slice(0, 50);
        binds.push(`%"${tagStr}"%`, `%"${tagStr}",%`, `%,"${tagStr}"%`, `["${tagStr}"]`);
      }
      const sql = `SELECT id, target_user_id, target_business_id, room_id, author_user_id, author_name,
                          assigned_to_user_id, memo_type, content, is_edited,
                          due_date, linked_message_id, filing_type, filing_period,
                          category, tags, attachments, created_at, updated_at
                     FROM memos
                    WHERE ${where.join(' AND ')}
                    ORDER BY created_at DESC LIMIT 200`;
      const { results } = await db.prepare(sql).bind(...binds).all();
      const normalized = (results || []).map(r => ({
        ...r,
        memo_type_display: LEGACY_MAP[r.memo_type] || r.memo_type,
        tags: r.tags ? safeParseJson(r.tags) : [],
        attachments: r.attachments ? safeParseJson(r.attachments) : [],
      }));
      return Response.json({ ok: true, memos: normalized, types: NEW_TYPES, categories: ALLOWED_CATEGORIES.filter(Boolean) });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* === 거래처(업체) 단위 D-day 일정 (target_business_id + due_date 있는 미완료 메모) === */
  if (scope === 'business_due') {
    const businessId = Number(url.searchParams.get('business_id') || 0);
    if (!businessId) return Response.json({ error: "business_id required" }, { status: 400 });
    try {
      const { results } = await db.prepare(
        `SELECT id, target_business_id, author_user_id, author_name, memo_type, content, due_date,
                filing_type, filing_period, linked_message_id, created_at, updated_at
           FROM memos
          WHERE target_business_id = ?
            AND due_date IS NOT NULL
            AND deleted_at IS NULL
            AND memo_type IN ('할 일','확인필요','고객요청','거래처 정보')
          ORDER BY due_date ASC LIMIT 30`
      ).bind(businessId).all();
      return Response.json({ ok: true, schedule: results || [] });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* === 거래처(업체) 단위 영구 메모 (target_business_id 기반) === */
  if (scope === 'business_info') {
    const businessId = Number(url.searchParams.get('business_id') || 0);
    if (!businessId) return Response.json({ error: "business_id required" }, { status: 400 });
    try {
      const { results } = await db.prepare(
        `SELECT id, target_business_id, target_user_id, author_user_id, author_name, memo_type, content, is_edited,
                due_date, linked_message_id, filing_type, filing_period, created_at, updated_at
           FROM memos
          WHERE target_business_id = ? AND memo_type = '거래처 정보' AND deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 200`
      ).bind(businessId).all();
      return Response.json({ ok: true, memos: results || [], types: NEW_TYPES });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* === 대시보드 모드: 전체 방 + 개인 일정에서 미완료 할 일 한꺼번에 === */
  if (scope === 'my') {
    const onlyMine = url.searchParams.get("only_mine") === '1';
    const uid = auth.userId || 0;
    try {
      /* 1. 미완료 할 일만 (완료·참고는 대시보드에서 제외) + 방 정보 JOIN */
      let whereAssignee = '';
      const binds = [];
      if (onlyMine && uid) {
        /* 내 것만: 내가 담당자거나 작성자거나 미지정(대표 공용) */
        whereAssignee = ` AND (m.assigned_to_user_id = ? OR m.author_user_id = ? OR m.assigned_to_user_id IS NULL)`;
        binds.push(uid, uid);
      }
      const sql = `SELECT m.id, m.room_id, m.target_business_id, m.target_user_id,
                          m.author_user_id, m.author_name, m.assigned_to_user_id,
                          m.memo_type, m.content, m.is_edited, m.due_date, m.linked_message_id,
                          m.category, m.tags, m.attachments,
                          m.created_at, m.updated_at,
                          r.name AS room_name
                     FROM memos m
                LEFT JOIN chat_rooms r ON m.room_id = r.id
                    WHERE m.deleted_at IS NULL
                      AND (m.memo_type IN ('할 일','확인필요','고객요청'))
                      ${whereAssignee}
                    ORDER BY
                      CASE WHEN m.due_date IS NULL THEN 1 ELSE 0 END,
                      m.due_date ASC,
                      m.created_at DESC
                    LIMIT 300`;
      const { results } = await db.prepare(sql).bind(...binds).all();
      const normalized = (results || []).map(r => ({
        ...r,
        memo_type_display: LEGACY_MAP[r.memo_type] || r.memo_type,
        tags: r.tags ? safeParseJson(r.tags) : [],
        attachments: r.attachments ? safeParseJson(r.attachments) : [],
      }));
      return Response.json({ ok: true, memos: normalized, types: NEW_TYPES, scope: 'my' });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* === 단일 방 모드 === */
  if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });

  try {
    const { results } = await db.prepare(
      `SELECT id, room_id, author_user_id, author_name, assigned_to_user_id, memo_type, content, is_edited,
              due_date, linked_message_id, category, tags, attachments, created_at, updated_at
         FROM memos
        WHERE room_id = ? AND deleted_at IS NULL
        ORDER BY
          CASE memo_type WHEN '할 일' THEN 0 WHEN '확인필요' THEN 0 WHEN '고객요청' THEN 0
                         WHEN '참고' THEN 1 WHEN '사실메모' THEN 1 WHEN '담당자판단' THEN 1 WHEN '주의사항' THEN 1
                         ELSE 2 END,
          COALESCE(due_date, '9999-99-99') ASC,
          created_at DESC
        LIMIT 200`
    ).bind(roomId).all();
    const normalized = (results || []).map(r => ({
      ...r,
      memo_type_display: LEGACY_MAP[r.memo_type] || r.memo_type,
      tags: r.tags ? safeParseJson(r.tags) : [],
      attachments: r.attachments ? safeParseJson(r.attachments) : [],
    }));
    return Response.json({ ok: true, memos: normalized, types: NEW_TYPES });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  /* room_id 없으면 개인 일정 또는 거래처 단위 영구 메모.
     구버전 D1 테이블이 room_id NOT NULL 제약 가진 경우가 있어
     placeholder '__none__' 로 채움. 조회는 target_user_id 기반이라 무관 */
  const rawRoomId = body.room_id ? String(body.room_id || '').trim() : '';
  const roomId = rawRoomId || '__none__';
  const memoType = ALLOWED_TYPES.includes(body.memo_type) ? body.memo_type : '할 일';
  const content = String(body.content || '').trim();
  if (!content) return Response.json({ error: "content required" }, { status: 400 });
  if (content.length > 2000) return Response.json({ error: "content too long (max 2000)" }, { status: 400 });

  const dueDate = body.due_date && validDate(body.due_date) ? body.due_date : null;
  const linkedMsgId = body.linked_message_id ? Number(body.linked_message_id) : null;
  const filingType = body.filing_type ? String(body.filing_type).slice(0, 30) : null;
  const filingPeriod = body.filing_period ? String(body.filing_period).slice(0, 30) : null;
  /* 담당자 — 명시 없으면 작성자 본인 */
  const assignedToUserId = body.assigned_to_user_id
    ? Number(body.assigned_to_user_id)
    : (auth.userId || null);

  /* target_user_id: 거래처 영구 메모 저장 대상.
     - body 에 명시하면 그대로
     - 아니면 거래처 정보 타입일 때 방에서 자동 추론 (첫 non-admin 멤버) */
  let targetUserId = body.target_user_id ? Number(body.target_user_id) : null;
  if (memoType === '거래처 정보' && !targetUserId && roomId) {
    try {
      const mem = await db.prepare(
        `SELECT user_id FROM room_members
         WHERE room_id = ? AND left_at IS NULL AND user_id IS NOT NULL AND role != 'admin'
         ORDER BY joined_at ASC LIMIT 1`
      ).bind(roomId).first();
      if (mem?.user_id) targetUserId = mem.user_id;
    } catch {}
  }
  /* target_business_id: 거래처(업체) 단위 영구 메모 저장 대상. body 에서 직접 받음. */
  const targetBusinessId = body.target_business_id ? Number(body.target_business_id) : null;

  /* 메모 빡센 세팅 — 카테고리 / 태그 / 첨부 */
  const category = ALLOWED_CATEGORIES.includes(body.category) ? (body.category || null) : null;
  const tags = normalizeTags(body.tags, content);  /* content #태그 자동 추출 + 머지 */
  const attachments = normalizeAttachments(body.attachments);

  const authorUserId = auth.userId || null;
  const authorName = auth.name || auth.realName || (auth.owner ? '대표' : '담당자');

  const now = kst();
  try {
    const r = await db.prepare(
      `INSERT INTO memos (room_id, target_user_id, target_business_id, author_user_id, author_name, assigned_to_user_id, memo_type, content, visibility, is_edited, due_date, linked_message_id, filing_type, filing_period, category, tags, attachments, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'internal', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(roomId, targetUserId, targetBusinessId, authorUserId, authorName, assignedToUserId, memoType, content, dueDate, linkedMsgId, filingType, filingPeriod, category, tags, attachments, now, now).run();
    return Response.json({ ok: true, id: r.meta?.last_row_id || null, tags: tags ? safeParseJson(tags) : [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get("id") || 0);
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const fields = [], binds = [];
  if (body.memo_type !== undefined) {
    if (!ALLOWED_TYPES.includes(body.memo_type)) return Response.json({ error: "invalid memo_type" }, { status: 400 });
    fields.push('memo_type = ?'); binds.push(body.memo_type);
  }
  if (body.content !== undefined) {
    const c = String(body.content || '').trim();
    if (!c) return Response.json({ error: "content required" }, { status: 400 });
    if (c.length > 2000) return Response.json({ error: "content too long" }, { status: 400 });
    fields.push('content = ?'); binds.push(c);
  }
  if (body.due_date !== undefined) {
    if (body.due_date === null || body.due_date === '') {
      fields.push('due_date = NULL');
    } else if (validDate(body.due_date)) {
      fields.push('due_date = ?'); binds.push(body.due_date);
    } else return Response.json({ error: "invalid due_date (YYYY-MM-DD)" }, { status: 400 });
  }
  if (body.linked_message_id !== undefined) {
    if (body.linked_message_id === null || body.linked_message_id === '') {
      fields.push('linked_message_id = NULL');
    } else {
      const n = Number(body.linked_message_id);
      if (!Number.isInteger(n) || n <= 0) return Response.json({ error: "invalid linked_message_id" }, { status: 400 });
      fields.push('linked_message_id = ?'); binds.push(n);
    }
  }
  if (body.assigned_to_user_id !== undefined) {
    if (body.assigned_to_user_id === null || body.assigned_to_user_id === '') {
      fields.push('assigned_to_user_id = NULL');
    } else {
      const n = Number(body.assigned_to_user_id);
      if (!Number.isInteger(n) || n <= 0) return Response.json({ error: "invalid assigned_to_user_id" }, { status: 400 });
      fields.push('assigned_to_user_id = ?'); binds.push(n);
    }
  }
  if (body.target_user_id !== undefined) {
    if (body.target_user_id === null || body.target_user_id === '') {
      fields.push('target_user_id = NULL');
    } else {
      const n = Number(body.target_user_id);
      if (!Number.isInteger(n) || n <= 0) return Response.json({ error: "invalid target_user_id" }, { status: 400 });
      fields.push('target_user_id = ?'); binds.push(n);
    }
  }
  if (body.filing_type !== undefined) {
    fields.push('filing_type = ?'); binds.push(body.filing_type ? String(body.filing_type).slice(0,30) : null);
  }
  if (body.filing_period !== undefined) {
    fields.push('filing_period = ?'); binds.push(body.filing_period ? String(body.filing_period).slice(0,30) : null);
  }
  if (body.category !== undefined) {
    if (body.category === null || body.category === '') {
      fields.push('category = NULL');
    } else if (ALLOWED_CATEGORIES.includes(body.category)) {
      fields.push('category = ?'); binds.push(body.category);
    } else return Response.json({ error: "invalid category" }, { status: 400 });
  }
  if (body.tags !== undefined) {
    /* content 가 같이 변경되면 그것도 다시 #태그 추출 */
    const contentForTags = body.content !== undefined ? String(body.content || '') : '';
    const norm = normalizeTags(body.tags, contentForTags);
    if (norm === null) fields.push('tags = NULL');
    else { fields.push('tags = ?'); binds.push(norm); }
  } else if (body.content !== undefined) {
    /* tags 명시 안 했어도 content 변경되면 #태그 자동 재추출 */
    const norm = normalizeTags([], body.content);
    if (norm) { fields.push('tags = ?'); binds.push(norm); }
  }
  if (body.attachments !== undefined) {
    const norm = normalizeAttachments(body.attachments);
    if (norm === null) fields.push('attachments = NULL');
    else { fields.push('attachments = ?'); binds.push(norm); }
  }
  if (!fields.length) return Response.json({ error: "nothing to update" }, { status: 400 });
  /* content 수정 시에만 is_edited=1. memo_type·due_date 단독 변경은 상태 전환이지 수정 아님 */
  if (body.content !== undefined) fields.push("is_edited = 1");
  fields.push("updated_at = ?"); binds.push(kst());

  try {
    binds.push(id);
    await db.prepare(`UPDATE memos SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).bind(...binds).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get("id") || 0);
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  try {
    await db.prepare(`UPDATE memos SET deleted_at = ? WHERE id = ?`).bind(kst(), id).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
