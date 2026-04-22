// 상담방 담당자 메모 (내부 전용)
// - GET    /api/memos?room_id=X                → 방 메모 목록 (최신순)
// - POST   /api/memos                           → 생성 { room_id, memo_type, content }
// - PATCH  /api/memos?id=N                      → 수정 { memo_type?, content? }
// - DELETE /api/memos?id=N                      → soft delete
//
// 인증: checkAdmin (ADMIN_KEY 또는 스태프 세션)
// visibility: 'internal' 고정 (고객 공개 금지)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

const ALLOWED_TYPES = ['사실메모', '확인필요', '고객요청', '담당자판단', '주의사항', '완료처리'];

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
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
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const roomId = url.searchParams.get("room_id");
  if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });

  try {
    const { results } = await db.prepare(
      `SELECT id, room_id, author_user_id, author_name, memo_type, content, is_edited, created_at, updated_at
         FROM memos
        WHERE room_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 100`
    ).bind(roomId).all();
    return Response.json({ ok: true, memos: results || [], types: ALLOWED_TYPES });
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

  const roomId = String(body.room_id || '').trim();
  const memoType = ALLOWED_TYPES.includes(body.memo_type) ? body.memo_type : '사실메모';
  const content = String(body.content || '').trim();
  if (!roomId) return Response.json({ error: "room_id required" }, { status: 400 });
  if (!content) return Response.json({ error: "content required" }, { status: 400 });
  if (content.length > 2000) return Response.json({ error: "content too long (max 2000)" }, { status: 400 });

  /* 작성자 정보 — 스태프 세션이면 이름, ADMIN_KEY면 '대표' */
  const authorUserId = auth.userId || null;
  const authorName = auth.name || auth.realName || (auth.owner ? '대표' : '담당자');

  const now = kst();
  try {
    const r = await db.prepare(
      `INSERT INTO memos (room_id, author_user_id, author_name, memo_type, content, visibility, is_edited, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'internal', 0, ?, ?)`
    ).bind(roomId, authorUserId, authorName, memoType, content, now, now).run();
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
  if (!fields.length) return Response.json({ error: "nothing to update" }, { status: 400 });
  fields.push("is_edited = 1", "updated_at = ?"); binds.push(kst());

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
