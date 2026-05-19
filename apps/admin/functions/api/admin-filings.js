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

import { checkAdmin, adminUnauthorized, checkOriginCsrf } from "./_adminAuth.js";

/* Phase 16 (2026-05-17) 사장님 명령: 부가세 검토표 추가.
 * 부가세 = 1 사업장 × 1년 = 1 검토표 (4기수 1예정/1확정/2예정/2확정 + 멘트 누적, auto_fields.vat 에 저장).
 * 중복 방지·작년 자동 참조 로직은 종소세와 동일 (type+fiscal_year+owner 기준). */
const FILING_TYPES = ['종소세', '법인세', '부가세'];
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

  /* Phase 7 (2026-05-07): ChatRoom 통합 — ?room_id=X 로 그 방 관련 모든 Case 조회.
   * room_members 의 user_id (Person Case) + room_businesses 의 business_id (Business Case)
   * + 레거시 chat_rooms.business_id 도 포함. */
  const roomId = url.searchParams.get('room_id');
  if (roomId) {
    try {
      const userIds = [];
      const bizIds = [];
      try {
        const m = await db.prepare(`SELECT user_id FROM room_members WHERE room_id = ? AND (left_at IS NULL OR left_at = '') AND user_id IS NOT NULL`).bind(roomId).all();
        (m.results || []).forEach(r => { if (r.user_id) userIds.push(r.user_id); });
      } catch {}
      try {
        const b = await db.prepare(`SELECT business_id FROM room_businesses WHERE room_id = ? AND (removed_at IS NULL OR removed_at = '')`).bind(roomId).all();
        (b.results || []).forEach(r => { if (r.business_id) bizIds.push(r.business_id); });
      } catch {}
      try {
        const cr = await db.prepare(`SELECT business_id FROM chat_rooms WHERE id = ?`).bind(roomId).first();
        if (cr?.business_id && !bizIds.includes(cr.business_id)) bizIds.push(cr.business_id);
      } catch {}

      const conditions = [];
      const params = [];
      if (userIds.length) {
        conditions.push(`(owner_type = 'Person' AND owner_id IN (${userIds.map(() => '?').join(',')}))`);
        params.push(...userIds);
      }
      if (bizIds.length) {
        conditions.push(`(owner_type = 'Business' AND owner_id IN (${bizIds.map(() => '?').join(',')}))`);
        params.push(...bizIds);
      }
      if (!conditions.length) {
        return Response.json({ ok: true, filings: [] });
      }
      const sql = `SELECT * FROM filings WHERE (deleted_at IS NULL OR deleted_at = '') AND (${conditions.join(' OR ')}) ORDER BY fiscal_year DESC, type ASC, id DESC LIMIT 100`;
      const r = await db.prepare(sql).bind(...params).all();
      return Response.json({ ok: true, filings: r.results || [], userIds, bizIds });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* 검토표 모아보기 (2026-05-19 사장님 본적용 #2) — 전체 Filing 한 목록.
     기존 데이터 읽기 전용. owner 명 LEFT JOIN. 필터: type / status / year. 추가형 — 회귀 0. */
  if (url.searchParams.get('all') === '1') {
    const tF = (url.searchParams.get('type') || '').trim();
    const sF = (url.searchParams.get('status') || '').trim();
    const yF = Number(url.searchParams.get('year') || 0);
    try {
      const where = ["(f.deleted_at IS NULL OR f.deleted_at = '')"];
      const binds = [];
      if (tF) { where.push('f.type = ?'); binds.push(tF); }
      if (sF) { where.push('f.review_status = ?'); binds.push(sF); }
      if (yF) { where.push('f.fiscal_year = ?'); binds.push(yF); }
      const { results } = await db.prepare(`
        SELECT f.id, f.type, f.fiscal_year, f.owner_type, f.owner_id,
               f.review_status, f.reviewer_comment, f.created_at, f.updated_at,
               u.real_name AS person_real_name, u.name AS person_name,
               b.company_name AS business_name
          FROM filings f
          LEFT JOIN users u ON f.owner_type = 'Person' AND f.owner_id = u.id
          LEFT JOIN businesses b ON f.owner_type = 'Business' AND f.owner_id = b.id
         WHERE ${where.join(' AND ')}
         ORDER BY f.fiscal_year DESC, f.type ASC, f.updated_at DESC
         LIMIT 800
      `).bind(...binds).all();
      return Response.json({ ok: true, filings: results || [] });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
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
  /* Phase 14 (2026-05-12): CSRF Origin/Referer 가드 — 일괄 적용. */
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
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
  /* Phase 14 (2026-05-12): CSRF Origin/Referer 가드 — 일괄 적용. */
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
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
  /* Phase 14 (2026-05-12): CSRF Origin/Referer 가드 — 일괄 적용. */
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
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
