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
const NEW_TYPES = ['할 일', '완료', '참고'];
const LEGACY_TYPES = ['사실메모', '확인필요', '고객요청', '담당자판단', '주의사항', '완료처리'];
const ALLOWED_TYPES = NEW_TYPES.concat(LEGACY_TYPES);
/* 구 타입 → 신 타입 매핑 (프론트 렌더·요약 프롬프트에서 사용) */
const LEGACY_MAP = {
  '사실메모': '참고', '확인필요': '할 일', '고객요청': '할 일',
  '담당자판단': '참고', '주의사항': '참고', '완료처리': '완료',
};

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
  /* 스키마: room_id 는 개인 일정 허용 위해 NULL 가능. assigned_to_user_id 는 담당자 (미지정=대표 본인) */
  await db.prepare(`CREATE TABLE IF NOT EXISTS memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT,
    author_user_id INTEGER,
    author_name TEXT,
    assigned_to_user_id INTEGER,
    memo_type TEXT DEFAULT '할 일',
    content TEXT NOT NULL,
    visibility TEXT DEFAULT 'internal',
    is_edited INTEGER DEFAULT 0,
    due_date TEXT,
    linked_message_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_room ON memos(room_id, created_at DESC)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memos_assignee ON memos(assigned_to_user_id, due_date)`).run(); } catch {}
  /* 구버전 테이블 — 컬럼 추가 시도 (없으면 skip) */
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN due_date TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN linked_message_id INTEGER`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE memos ADD COLUMN assigned_to_user_id INTEGER`).run(); } catch {}
}

function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const scope = url.searchParams.get("scope");  // 'my' = 내 담당 + 방 전체 (대시보드용)
  const roomId = url.searchParams.get("room_id");

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
      const sql = `SELECT m.id, m.room_id, m.author_user_id, m.author_name, m.assigned_to_user_id,
                          m.memo_type, m.content, m.is_edited, m.due_date, m.linked_message_id,
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
              due_date, linked_message_id, created_at, updated_at
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

  /* room_id 없으면 개인 일정 (NULL 허용) */
  const roomId = body.room_id ? String(body.room_id || '').trim() : null;
  const memoType = ALLOWED_TYPES.includes(body.memo_type) ? body.memo_type : '할 일';
  const content = String(body.content || '').trim();
  if (!content) return Response.json({ error: "content required" }, { status: 400 });
  if (content.length > 2000) return Response.json({ error: "content too long (max 2000)" }, { status: 400 });

  const dueDate = body.due_date && validDate(body.due_date) ? body.due_date : null;
  const linkedMsgId = body.linked_message_id ? Number(body.linked_message_id) : null;
  /* 담당자 — 명시 없으면 작성자 본인 */
  const assignedToUserId = body.assigned_to_user_id
    ? Number(body.assigned_to_user_id)
    : (auth.userId || null);

  const authorUserId = auth.userId || null;
  const authorName = auth.name || auth.realName || (auth.owner ? '대표' : '담당자');

  const now = kst();
  try {
    const r = await db.prepare(
      `INSERT INTO memos (room_id, author_user_id, author_name, assigned_to_user_id, memo_type, content, visibility, is_edited, due_date, linked_message_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'internal', 0, ?, ?, ?, ?)`
    ).bind(roomId, authorUserId, authorName, assignedToUserId, memoType, content, dueDate, linkedMsgId, now, now).run();
    return Response.json({ ok: true, id: r.meta?.last_row_id || null });
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
