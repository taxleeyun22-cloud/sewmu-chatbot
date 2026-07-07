/**
 * 📖 업무 가이드 (2026-07-07 사장님 명령: "부가세 주의사항 이런거 해서 직원들이 다 읽어볼수있도록"):
 * 사내 업무 매뉴얼/주의사항 게시판 — 읽음확인 없음, 콘텐츠+가독성 중심 (사장님 결정).
 *
 * Endpoints:
 *   GET    /api/admin-guides            → 목록 (pinned 우선 → updated_at desc). ?category= 필터.
 *                                         열람 = checkAdmin 통과 전원 (viewer 포함, 직원 열람용)
 *   POST   /api/admin-guides            body: { title, category, content, pinned? } → 생성
 *   PUT    /api/admin-guides            body: { id, title?, category?, content?, pinned? } → 수정
 *   DELETE /api/admin-guides?id=N       → soft delete (deleted_at)
 *                                         쓰기 3종 = hasAdminRole(auth, 'admin') (사장님 + admin)
 *
 * 서식: content 는 간단 마크다운 (# 제목 / - 불릿 / **강조** / > 주의박스 / ---) —
 *       렌더링은 프론트 admin-guides.js 의 XSS-safe 미니 렌더러가 담당. 서버는 원문 저장만.
 */

import { checkAdmin, adminUnauthorized, hasAdminRole, roleForbidden, checkOriginCsrf } from "./_adminAuth.js";
import { logAudit } from "./_audit.js";

const KST_OFFSET = 9 * 60 * 60 * 1000;
function kst() {
  return new Date(Date.now() + KST_OFFSET).toISOString().replace('T', ' ').substring(0, 19);
}

const CATEGORIES = ['부가세', '원천세', '종소세', '법인세', '연말정산', '공통'];

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS work_guides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '공통',
    content TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    author_user_id INTEGER,
    author_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_work_guides_list ON work_guides(deleted_at, pinned DESC, updated_at DESC)`).run(); } catch (_) {}
}

/** 작성자 표기 — owner(ADMIN_KEY/HMAC 쿠키) 는 사장님, 세션이면 real_name 조회. */
async function actorName(db, auth) {
  if (auth.userId) {
    try {
      const row = await db.prepare(`SELECT real_name, name FROM users WHERE id = ?`).bind(auth.userId).first();
      if (row) return row.real_name || row.name || ('user#' + auth.userId);
    } catch (_) {}
    return 'user#' + auth.userId;
  }
  return auth.owner ? '사장님' : 'admin';
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const category = url.searchParams.get('category');

  try {
    let q = `SELECT id, title, category, content, pinned, author_name, created_at, updated_at
             FROM work_guides WHERE deleted_at IS NULL`;
    const binds = [];
    if (category && CATEGORIES.includes(category)) {
      q += ` AND category = ?`;
      binds.push(category);
    }
    q += ` ORDER BY pinned DESC, updated_at DESC LIMIT 300`;
    const { results } = await db.prepare(q).bind(...binds).all();
    return Response.json({ ok: true, guides: results || [], categories: CATEGORIES, canWrite: hasAdminRole(auth, 'admin') });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  if (!hasAdminRole(auth, 'admin')) return roleForbidden('admin');

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const title = String(body.title || '').trim().slice(0, 200);
  const content = String(body.content || '').slice(0, 50000);
  const category = CATEGORIES.includes(body.category) ? body.category : '공통';
  const pinned = body.pinned ? 1 : 0;
  if (!title) return Response.json({ error: '제목을 입력해주세요' }, { status: 400 });
  if (!content.trim()) return Response.json({ error: '내용을 입력해주세요' }, { status: 400 });

  try {
    const now = kst();
    const name = await actorName(db, auth);
    const r = await db.prepare(
      `INSERT INTO work_guides (title, category, content, pinned, author_user_id, author_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(title, category, content, pinned, auth.userId || null, name, now, now).run();
    const id = r?.meta?.last_row_id;
    logAudit(db, { actor: name, action: 'guide_create', entity_type: 'guide', entity_id: id, after: title, request: context.request });
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  if (!hasAdminRole(auth, 'admin')) return roleForbidden('admin');

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const id = Number(body.id);
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  try {
    const prev = await db.prepare(`SELECT id, title, category, content, pinned FROM work_guides WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
    if (!prev) return Response.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

    const title = body.title !== undefined ? String(body.title || '').trim().slice(0, 200) : prev.title;
    const content = body.content !== undefined ? String(body.content || '').slice(0, 50000) : prev.content;
    const category = body.category !== undefined
      ? (CATEGORIES.includes(body.category) ? body.category : '공통')
      : prev.category;
    const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : prev.pinned;
    if (!title) return Response.json({ error: '제목을 입력해주세요' }, { status: 400 });
    if (!content.trim()) return Response.json({ error: '내용을 입력해주세요' }, { status: 400 });

    await db.prepare(
      `UPDATE work_guides SET title = ?, category = ?, content = ?, pinned = ?, updated_at = ? WHERE id = ?`
    ).bind(title, category, content, pinned, kst(), id).run();

    const name = await actorName(db, auth);
    logAudit(db, { actor: name, action: 'guide_update', entity_type: 'guide', entity_id: id, before: prev.title, after: title, request: context.request });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  if (!hasAdminRole(auth, 'admin')) return roleForbidden('admin');

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  try {
    const prev = await db.prepare(`SELECT id, title FROM work_guides WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
    if (!prev) return Response.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

    await db.prepare(`UPDATE work_guides SET deleted_at = ? WHERE id = ?`).bind(kst(), id).run();
    const name = await actorName(db, auth);
    logAudit(db, { actor: name, action: 'guide_delete', entity_type: 'guide', entity_id: id, before: prev.title, request: context.request });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
