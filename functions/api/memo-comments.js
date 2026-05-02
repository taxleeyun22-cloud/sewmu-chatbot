// 메모 댓글 (memo_comments) — 한 메모에 후속 답글
// 사장님 명령 (2026-04-30 — 메모 빡센 세팅 후속 페이즈):
//   "5/15 영수증 수령" 메모에 → "추가 3장 더 받음" 같은 댓글
//
// GET    /api/memo-comments?memo_id=N           → 그 메모의 모든 댓글 (시간순 asc)
// POST   /api/memo-comments  body { memo_id, content }   → 댓글 추가
// DELETE /api/memo-comments?id=N               → 댓글 soft delete
//
// 인증: checkAdmin (관리자 영역, 고객 공개 X)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS memo_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memo_id INTEGER NOT NULL,
    author_user_id INTEGER,
    author_name TEXT,
    content TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memo_comments ON memo_comments(memo_id, created_at ASC)`).run(); } catch {}
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const memoId = Number(url.searchParams.get("memo_id") || 0);
  if (!memoId) return Response.json({ error: "memo_id required" }, { status: 400 });

  try {
    const { results } = await db.prepare(
      `SELECT id, memo_id, author_user_id, author_name, content, created_at, updated_at
         FROM memo_comments
        WHERE memo_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 200`
    ).bind(memoId).all();
    return Response.json({ ok: true, comments: results || [] });
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
  try { body = await context.request.json(); }
  catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const memoId = Number(body.memo_id || 0);
  const content = String(body.content || '').trim();
  if (!memoId) return Response.json({ error: "memo_id required" }, { status: 400 });
  if (!content) return Response.json({ error: "content required" }, { status: 400 });
  if (content.length > 2000) return Response.json({ error: "content too long (max 2000)" }, { status: 400 });

  /* 부모 메모 존재·살아있나 검증 */
  try {
    const parent = await db.prepare(`SELECT id FROM memos WHERE id = ? AND deleted_at IS NULL`).bind(memoId).first();
    if (!parent) return Response.json({ error: "parent memo not found" }, { status: 404 });
  } catch {}

  const authorUserId = auth.userId || null;
  const authorName = auth.name || auth.realName || (auth.owner ? '대표' : '담당자');
  const now = kst();
  try {
    const r = await db.prepare(
      `INSERT INTO memo_comments (memo_id, author_user_id, author_name, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(memoId, authorUserId, authorName, content, now, now).run();
    return Response.json({ ok: true, id: r.meta?.last_row_id || null });
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
    await db.prepare(`UPDATE memo_comments SET deleted_at = ? WHERE id = ?`).bind(kst(), id).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
