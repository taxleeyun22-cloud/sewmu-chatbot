/**
 * 🗂️ 서식함 (2026-08-17 사장님 명령: "우리 업무 양식 서식 이런거도 여기서 보관하면 좋을듯")
 * 사내 공용 서식·양식 보관함 — 위임장·확인서·계약서 양식 등 실제 파일(HWP/엑셀/워드/PDF) 보관.
 *
 * 업무 가이드(work_guides = 글) 와 역할 분리:
 *   가이드 = "어떻게 하는지" 설명글 / 서식함 = "그걸 할 때 쓰는 파일"
 *
 * Endpoints:
 *   GET    /api/admin-forms                  → 목록. ?category= 필터, ?q= 검색(제목·설명·파일명)
 *   GET    /api/admin-forms?action=history&id=N → 이전 버전 이력
 *   POST   /api/admin-forms?action=create    body: { title, category, description?, file_key, file_name, file_size?, mime? }
 *   POST   /api/admin-forms?action=update    body: { id, title?, category?, description?, pinned? }
 *   POST   /api/admin-forms?action=replace   body: { id, file_key, file_name, file_size?, mime? } → version++ (구버전은 이력 보존)
 *   POST   /api/admin-forms?action=hit       body: { id } → 다운로드 카운트 +1
 *   DELETE /api/admin-forms?id=N             → soft delete
 *
 * 권한 (2026-08-17 사장님 결정 "직원 전원 열람 · 전원 업로드"):
 *   - 열람/다운로드/업로드/수정 = checkAdmin 통과 전원 (viewer 직원 포함)
 *   - 삭제 = 본인이 올린 것 또는 admin 이상 (실수로 남의 서식 지우는 것 방지)
 *
 * 파일 자체는 R2. 업로드는 기존 upload-file.js(?scope=form → forms/ prefix) 재사용,
 * 다운로드는 기존 file.js(forms/ prefix = 관리자 인증 필수) 재사용. 여기선 메타만 관리.
 */

import { checkAdmin, adminUnauthorized, hasAdminRole, checkOriginCsrf } from "./_adminAuth.js";
import { logAudit } from "./_audit.js";

const KST_OFFSET = 9 * 60 * 60 * 1000;
function kst() {
  return new Date(Date.now() + KST_OFFSET).toISOString().replace('T', ' ').substring(0, 19);
}

const CATEGORIES = ['부가세', '원천세', '종소세', '법인세', '연말정산', '4대보험', '계약·위임', '공통'];

/* R2 키 검증 — forms/ prefix 만 허용 (다른 경로 파일을 서식으로 등록하는 것 차단) */
const FORM_KEY_RE = /^forms\/[A-Za-z0-9_.\-]{1,200}$/;

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS office_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '공통',
    description TEXT,
    file_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    mime TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    pinned INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    uploader_user_id INTEGER,
    uploader_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_office_forms_list ON office_forms(deleted_at, pinned DESC, updated_at DESC)`).run(); } catch (_) {}
  /* 구버전 이력 — 서식은 해마다 바뀌므로 이전 양식도 찾을 수 있어야 함 */
  await db.prepare(`CREATE TABLE IF NOT EXISTS office_form_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    file_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    replaced_by TEXT,
    replaced_at TEXT NOT NULL
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_ofh_form ON office_form_history(form_id, version DESC)`).run(); } catch (_) {}
}

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

function cleanCategory(c) {
  return CATEGORIES.includes(String(c || '')) ? String(c) : '공통';
}

/* 업로드 결과(file_key/file_name) 공통 검증 — create/replace 양쪽에서 사용 */
function readFilePayload(body) {
  const fileKey = String(body.file_key || '').trim();
  if (!FORM_KEY_RE.test(fileKey)) return { error: '잘못된 파일입니다 (서식함 업로드를 통해서만 등록 가능)' };
  const fileName = String(body.file_name || '').replace(/[\x00-\x1f\\\/]/g, '_').trim().slice(0, 200);
  if (!fileName) return { error: '파일명이 없습니다' };
  const sizeNum = Number(body.file_size);
  return {
    fileKey,
    fileName,
    fileSize: Number.isFinite(sizeNum) && sizeNum > 0 ? Math.floor(sizeNum) : null,
    mime: String(body.mime || '').slice(0, 100) || null,
  };
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);

  /* 버전 이력 조회 */
  if (url.searchParams.get('action') === 'history') {
    const id = Number(url.searchParams.get('id'));
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    try {
      const { results } = await db.prepare(
        `SELECT version, file_key, file_name, file_size, replaced_by, replaced_at
         FROM office_form_history WHERE form_id = ? ORDER BY version DESC LIMIT 50`
      ).bind(id).all();
      return Response.json({ ok: true, history: results || [] });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  const category = url.searchParams.get('category');
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 60);

  try {
    let sql = `SELECT id, title, category, description, file_key, file_name, file_size, mime,
                      version, pinned, download_count, uploader_user_id, uploader_name,
                      created_at, updated_at
               FROM office_forms WHERE deleted_at IS NULL`;
    const binds = [];
    if (category && CATEGORIES.includes(category)) {
      sql += ` AND category = ?`;
      binds.push(category);
    }
    if (q) {
      sql += ` AND (title LIKE ? OR description LIKE ? OR file_name LIKE ?)`;
      const like = '%' + q + '%';
      binds.push(like, like, like);
    }
    sql += ` ORDER BY pinned DESC, updated_at DESC LIMIT 300`;
    const { results } = await db.prepare(sql).bind(...binds).all();
    const forms = results || [];

    /* 삭제 버튼 노출 판단용 — 본인 업로드 또는 admin 이상 */
    const isAdminPlus = hasAdminRole(auth, 'admin');
    for (const f of forms) {
      f.can_delete = isAdminPlus || (auth.userId && Number(f.uploader_user_id) === Number(auth.userId)) ? 1 : 0;
    }

    return Response.json({ ok: true, forms, categories: CATEGORIES, isAdmin: isAdminPlus ? 1 : 0 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'create';

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const now = kst();

  /* 다운로드 카운트 — 별도 권한 없음(열람 가능 전원) */
  if (action === 'hit') {
    const id = Number(body.id);
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    try {
      await db.prepare(
        `UPDATE office_forms SET download_count = download_count + 1 WHERE id = ? AND deleted_at IS NULL`
      ).bind(id).run();
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* 신규 등록 */
  if (action === 'create') {
    const title = String(body.title || '').trim().slice(0, 200);
    if (!title) return Response.json({ error: '서식 이름을 입력해주세요' }, { status: 400 });
    const f = readFilePayload(body);
    if (f.error) return Response.json({ error: f.error }, { status: 400 });

    try {
      const name = await actorName(db, auth);
      const r = await db.prepare(
        `INSERT INTO office_forms
           (title, category, description, file_key, file_name, file_size, mime,
            version, pinned, download_count, uploader_user_id, uploader_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?)`
      ).bind(
        title, cleanCategory(body.category), String(body.description || '').slice(0, 2000) || null,
        f.fileKey, f.fileName, f.fileSize, f.mime,
        body.pinned ? 1 : 0, auth.userId || null, name, now, now
      ).run();
      const newId = r.meta && r.meta.last_row_id ? r.meta.last_row_id : null;
      logAudit(db, { actor: name, action: 'form_create', entity_type: 'form', entity_id: newId, after: title, request: context.request });
      return Response.json({ ok: true, id: newId });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* 메타 수정 (파일 제외) */
  if (action === 'update') {
    const id = Number(body.id);
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    const updates = [];
    const binds = [];
    if (typeof body.title === 'string') {
      const t = body.title.trim().slice(0, 200);
      if (!t) return Response.json({ error: '서식 이름은 비울 수 없습니다' }, { status: 400 });
      updates.push('title = ?'); binds.push(t);
    }
    if (typeof body.category === 'string') { updates.push('category = ?'); binds.push(cleanCategory(body.category)); }
    if (typeof body.description === 'string') { updates.push('description = ?'); binds.push(body.description.slice(0, 2000) || null); }
    if (body.pinned === 0 || body.pinned === 1 || typeof body.pinned === 'boolean') { updates.push('pinned = ?'); binds.push(body.pinned ? 1 : 0); }
    if (!updates.length) return Response.json({ error: '변경할 내용이 없습니다' }, { status: 400 });

    try {
      updates.push('updated_at = ?'); binds.push(now);
      binds.push(id);
      await db.prepare(`UPDATE office_forms SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`).bind(...binds).run();
      const name = await actorName(db, auth);
      logAudit(db, { actor: name, action: 'form_update', entity_type: 'form', entity_id: id, after: String(body.title || ''), request: context.request });
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* 새 버전 올리기 — 구버전은 이력으로 보존 (R2 파일은 지우지 않음) */
  if (action === 'replace') {
    const id = Number(body.id);
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    const f = readFilePayload(body);
    if (f.error) return Response.json({ error: f.error }, { status: 400 });

    try {
      const cur = await db.prepare(
        `SELECT id, title, version, file_key, file_name, file_size FROM office_forms WHERE id = ? AND deleted_at IS NULL`
      ).bind(id).first();
      if (!cur) return Response.json({ error: '서식을 찾을 수 없습니다' }, { status: 404 });

      const name = await actorName(db, auth);
      await db.prepare(
        `INSERT INTO office_form_history (form_id, version, file_key, file_name, file_size, replaced_by, replaced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, cur.version, cur.file_key, cur.file_name, cur.file_size, name, now).run();

      await db.prepare(
        `UPDATE office_forms SET file_key = ?, file_name = ?, file_size = ?, mime = ?,
                                 version = version + 1, updated_at = ?
         WHERE id = ?`
      ).bind(f.fileKey, f.fileName, f.fileSize, f.mime, now, id).run();

      logAudit(db, { actor: name, action: 'form_replace', entity_type: 'form', entity_id: id, after: `v${cur.version} → v${cur.version + 1}`, request: context.request });
      return Response.json({ ok: true, version: cur.version + 1 });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}

export async function onRequestDelete(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const id = Number(new URL(context.request.url).searchParams.get('id'));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  try {
    const row = await db.prepare(
      `SELECT id, title, uploader_user_id FROM office_forms WHERE id = ? AND deleted_at IS NULL`
    ).bind(id).first();
    if (!row) return Response.json({ error: '서식을 찾을 수 없습니다' }, { status: 404 });

    /* 본인 업로드 또는 admin 이상만 삭제 */
    const mine = auth.userId && Number(row.uploader_user_id) === Number(auth.userId);
    if (!mine && !hasAdminRole(auth, 'admin')) {
      return Response.json({ error: '본인이 올린 서식만 삭제할 수 있습니다 (그 외에는 admin 권한 필요)' }, { status: 403 });
    }

    await db.prepare(`UPDATE office_forms SET deleted_at = ? WHERE id = ?`).bind(kst(), id).run();
    const name = await actorName(db, auth);
    logAudit(db, { actor: name, action: 'form_delete', entity_type: 'form', entity_id: id, after: row.title, request: context.request });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
