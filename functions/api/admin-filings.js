// 신고 검토표 시스템 — Phase 1 (사장님 명세 2026-05-07)
// 종소세·법인세 신고 결재 검토표. 작년 vs 올해 비교 + 누적 메모 + PDF 출력.
//
// Endpoints:
// - GET  /api/admin-filings?owner_type=&owner_id=     → 그 owner 의 Filing list (귀속연도 desc)
// - GET  /api/admin-filings?id=N                       → 상세 1건 + 작년 Case 자동 참조
// - POST /api/admin-filings                            → 새 Filing 생성
//   body: { type, fiscal_year, owner_type, owner_id, included_business_ids? }
// - PATCH /api/admin-filings?id=N                       → auto_fields / reviewer_comment 등 수정 (자동 저장)
// - POST /api/admin-filings?action=set_status&id=N     → 상태 변경 (작성중 → 결재대기 → 보관완료)
//
// DB:
// - filings 테이블 (신규)
// - 기존 tax_filings (체크리스트) 와 완전 별도

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

const FILING_TYPES = ['종소세', '법인세'];
const REVIEW_STATUSES = ['작성중', '결재대기', '보관완료'];

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureFilingsTable(db) {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS filings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      included_business_ids TEXT,
      auto_fields TEXT,
      review_status TEXT DEFAULT '작성중',
      reviewer_comment TEXT,
      author_user_id INTEGER,
      reviewer_user_id INTEGER,
      reviewed_at TEXT,
      deleted_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`).run();
  } catch {}
  /* memos 인덱스 컬럼 lazy migration (Phase 1 — Filing 메모 통합 인덱스) */
  const addMemoCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await addMemoCol(`ALTER TABLE memos ADD COLUMN attached_to_type TEXT`);
  await addMemoCol(`ALTER TABLE memos ADD COLUMN attached_to_id INTEGER`);
  await addMemoCol(`ALTER TABLE memos ADD COLUMN related_persons_json TEXT`);
  await addMemoCol(`ALTER TABLE memos ADD COLUMN related_businesses_json TEXT`);
  await addMemoCol(`ALTER TABLE memos ADD COLUMN related_chatrooms_json TEXT`);
  await addMemoCol(`ALTER TABLE memos ADD COLUMN related_filings_json TEXT`);
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureFilingsTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id') || 0);

  /* 상세 1건 */
  if (id) {
    const f = await db.prepare(`SELECT * FROM filings WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')`).bind(id).first();
    if (!f) return Response.json({ error: 'not found' }, { status: 404 });

    /* 작년 Case 자동 참조 — 같은 owner + type, 직전 귀속연도 */
    let prev = null;
    try {
      prev = await db.prepare(`
        SELECT * FROM filings
        WHERE type = ? AND owner_type = ? AND owner_id = ?
          AND fiscal_year = ?
          AND (deleted_at IS NULL OR deleted_at = '')
          AND id != ?
        ORDER BY id DESC LIMIT 1
      `).bind(f.type, f.owner_type, f.owner_id, f.fiscal_year - 1, f.id).first();
    } catch {}

    return Response.json({ ok: true, filing: f, previous: prev });
  }

  /* list — 그 owner 의 모든 Case */
  const ownerType = url.searchParams.get('owner_type');
  const ownerId = Number(url.searchParams.get('owner_id') || 0);
  if (!ownerType || !ownerId) return Response.json({ error: 'owner_type / owner_id required' }, { status: 400 });

  try {
    const { results } = await db.prepare(`
      SELECT id, type, fiscal_year, owner_type, owner_id, included_business_ids,
             auto_fields, review_status, reviewer_comment,
             author_user_id, reviewer_user_id, reviewed_at,
             created_at, updated_at
      FROM filings
      WHERE owner_type = ? AND owner_id = ? AND (deleted_at IS NULL OR deleted_at = '')
      ORDER BY fiscal_year DESC, id DESC
      LIMIT 50
    `).bind(ownerType, ownerId).all();
    return Response.json({ ok: true, filings: results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureFilingsTable(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const now = kst();
  const actorUid = auth.userId || null;

  /* action=set_status — 결재 상태 변경 */
  if (action === 'set_status') {
    const id = Number(url.searchParams.get('id') || body.id || 0);
    const status = String(body.status || '').trim();
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    if (!REVIEW_STATUSES.includes(status)) return Response.json({ error: 'invalid status' }, { status: 400 });

    /* 보관완료 = owner only */
    if (status === '보관완료' && !auth.owner) {
      return Response.json({ error: 'owner only' }, { status: 403 });
    }

    const updates = ['review_status = ?', 'updated_at = ?'];
    const binds = [status, now];
    if (status === '보관완료') {
      updates.push('reviewer_user_id = ?', 'reviewed_at = ?');
      binds.push(actorUid, now);
    }
    binds.push(id);
    await db.prepare(`UPDATE filings SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    return Response.json({ ok: true, id, status });
  }

  /* 신규 Filing 생성 */
  const type = String(body.type || '').trim();
  const fiscalYear = Number(body.fiscal_year || 0);
  const ownerType = String(body.owner_type || '').trim();
  const ownerId = Number(body.owner_id || 0);
  const includedBizIds = Array.isArray(body.included_business_ids) ? body.included_business_ids.map(Number).filter(n => Number.isInteger(n) && n > 0) : [];

  if (!FILING_TYPES.includes(type)) return Response.json({ error: 'invalid type' }, { status: 400 });
  if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) return Response.json({ error: 'invalid fiscal_year' }, { status: 400 });
  if (!['Person', 'Business'].includes(ownerType)) return Response.json({ error: 'invalid owner_type' }, { status: 400 });
  if (!ownerId) return Response.json({ error: 'owner_id required' }, { status: 400 });

  /* 같은 owner + type + fiscal_year 중복 방지 */
  try {
    const dup = await db.prepare(`SELECT id FROM filings WHERE type = ? AND fiscal_year = ? AND owner_type = ? AND owner_id = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`)
      .bind(type, fiscalYear, ownerType, ownerId).first();
    if (dup) return Response.json({ error: '이미 같은 귀속연도 Case 가 있습니다 (id #' + dup.id + ')' }, { status: 409 });
  } catch {}

  const initialAutoFields = JSON.stringify({
    공제감면: [],
    가산세: [],
  });

  try {
    const r = await db.prepare(`
      INSERT INTO filings (type, fiscal_year, owner_type, owner_id, included_business_ids,
                           auto_fields, review_status, author_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '작성중', ?, ?, ?)
    `).bind(
      type, fiscalYear, ownerType, ownerId,
      includedBizIds.length ? JSON.stringify(includedBizIds) : null,
      initialAutoFields, actorUid, now, now
    ).run();
    return Response.json({ ok: true, id: r.meta?.last_row_id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/* PATCH — auto_fields / reviewer_comment / included_business_ids 수정 (자동 저장) */
export async function onRequestPatch(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureFilingsTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id') || 0);
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  /* 보관완료 상태면 read-only (owner 아니면 수정 X) */
  const f = await db.prepare(`SELECT review_status FROM filings WHERE id = ?`).bind(id).first();
  if (!f) return Response.json({ error: 'not found' }, { status: 404 });
  if (f.review_status === '보관완료' && !auth.owner) {
    return Response.json({ error: '보관완료 Case 는 owner 만 수정 가능' }, { status: 403 });
  }

  const updates = [];
  const binds = [];

  if (body.auto_fields !== undefined) {
    /* auto_fields 는 JSON object 또는 string 둘 다 받음 */
    const af = typeof body.auto_fields === 'string' ? body.auto_fields : JSON.stringify(body.auto_fields);
    updates.push('auto_fields = ?');
    binds.push(af);
  }
  if (typeof body.reviewer_comment === 'string') {
    updates.push('reviewer_comment = ?');
    binds.push(body.reviewer_comment.trim().slice(0, 5000) || null);
  }
  if (Array.isArray(body.included_business_ids)) {
    const ids = body.included_business_ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
    updates.push('included_business_ids = ?');
    binds.push(ids.length ? JSON.stringify(ids) : null);
  }

  if (!updates.length) return Response.json({ error: 'no fields to update' }, { status: 400 });

  updates.push('updated_at = ?');
  binds.push(kst());
  binds.push(id);

  try {
    await db.prepare(`UPDATE filings SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/* DELETE — soft delete (owner only) */
export async function onRequestDelete(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return Response.json({ error: 'owner only' }, { status: 403 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureFilingsTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id') || 0);
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  try {
    await db.prepare(`UPDATE filings SET deleted_at = ? WHERE id = ?`).bind(kst(), id).run();
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
