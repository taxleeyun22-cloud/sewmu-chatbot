// 관리자: 한 사용자의 여러 사업장 관리 (1:N)
// - GET  /api/admin-client-businesses?user_id=XX : 목록
// - POST /api/admin-client-businesses?user_id=XX : 신규 추가 (body: 사업장 정보)
// - PUT  /api/admin-client-businesses?id=XX : 업데이트
// - DELETE /api/admin-client-businesses?id=XX : 삭제

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

async function ensureTable(db) {
  // 신규 테이블 (복수 사업장 지원)
  await db.prepare(`CREATE TABLE IF NOT EXISTS client_businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    company_name TEXT,
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
    is_primary INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    updated_by TEXT
  )`).run();
  try {
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_client_businesses_user ON client_businesses(user_id)`).run();
  } catch {}

  // 위하고 호환 확장 필드 (2026-04-24)
  const add = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await add(`ALTER TABLE client_businesses ADD COLUMN sub_business_number TEXT`);
  await add(`ALTER TABLE client_businesses ADD COLUMN corporate_number TEXT`);
  await add(`ALTER TABLE client_businesses ADD COLUMN business_category TEXT`);
  await add(`ALTER TABLE client_businesses ADD COLUMN industry_code TEXT`);
  await add(`ALTER TABLE client_businesses ADD COLUMN fiscal_year_start TEXT`);
  await add(`ALTER TABLE client_businesses ADD COLUMN fiscal_year_end TEXT`);
  await add(`ALTER TABLE client_businesses ADD COLUMN company_form TEXT`);
  await add(`ALTER TABLE client_businesses ADD COLUMN fiscal_term INTEGER`);
  await add(`ALTER TABLE client_businesses ADD COLUMN hr_year INTEGER`);
  await add(`ALTER TABLE client_businesses ADD COLUMN priority INTEGER`);

  // 기존 client_profiles 데이터 1회 마이그레이션
  try {
    const migrated = await db.prepare(
      `SELECT COUNT(*) as c FROM client_businesses`
    ).first();
    if (!migrated || migrated.c === 0) {
      // 기존 1:1 프로필을 1:N으로 복사
      await db.prepare(`
        INSERT INTO client_businesses (
          user_id, company_name, business_number, ceo_name, industry,
          business_type, tax_type, establishment_date, address, phone,
          employee_count, last_revenue, vat_period, notes, is_primary,
          created_at, updated_at, updated_by
        )
        SELECT user_id, company_name, business_number, ceo_name, industry,
               business_type, tax_type, establishment_date, address, phone,
               employee_count, last_revenue, vat_period, notes, 1,
               updated_at, updated_at, 'migration'
        FROM client_profiles
      `).run();
    }
  } catch (e) { console.error("migration error:", e); }
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

// GET 목록
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const userId = url.searchParams.get("user_id");
  if (!userId) return Response.json({ ok: false, error: "user_id required" }, { status: 400 });

  try {
    const { results } = await db.prepare(`
      SELECT * FROM client_businesses WHERE user_id = ?
      ORDER BY is_primary DESC, created_at ASC
    `).bind(userId).all();
    return Response.json({ ok: true, businesses: results || [] });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST 신규 추가
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const userId = url.searchParams.get("user_id");
  if (!userId) return Response.json({ ok: false, error: "user_id required" }, { status: 400 });

  try {
    const body = await context.request.json();
    const now = kst();

    /* === 중복 감지 (UPSERT) ===
       같은 user 가 두 경로(관리자 수동 등록 + 고객 본인 입력)로 사업장을 등록해
       '세무회계 이윤' 과 '세무회계이윤' 이 따로 저장되는 문제 방지.
       규칙: 정규화된 사업자번호가 같으면 UPDATE, 사업자번호 둘 다 없고
       정규화된 상호가 같으면 UPDATE */
    const normBiz = (body.business_number || "").replace(/\D/g, "");
    const normName = String(body.company_name || "").replace(/\s+/g, "").toLowerCase();
    let existing = null;
    try {
      const { results: rows } = await db.prepare(
        `SELECT id, company_name, business_number FROM client_businesses WHERE user_id = ?`
      ).bind(userId).all();
      for (const r of (rows || [])) {
        const rb = String(r.business_number || "").replace(/\D/g, "");
        const rn = String(r.company_name || "").replace(/\s+/g, "").toLowerCase();
        if (normBiz && rb && normBiz === rb) { existing = r; break; }
        if (!normBiz && !rb && normName && rn && normName === rn) { existing = r; break; }
      }
    } catch {}

    // 주 사업장(is_primary) 설정 처리: 기존 주 사업장 해제
    if (body.is_primary) {
      await db.prepare(`UPDATE client_businesses SET is_primary = 0 WHERE user_id = ?`).bind(userId).run();
    }

    const subBizNo = String(body.sub_business_number || "").replace(/\D/g, "") || null;
    const corpNo = String(body.corporate_number || "").replace(/\D/g, "") || null;

    if (existing) {
      await db.prepare(`
        UPDATE client_businesses SET
          company_name = ?, business_number = ?, ceo_name = ?, industry = ?,
          business_type = ?, tax_type = ?, establishment_date = ?, address = ?,
          phone = ?, employee_count = ?, last_revenue = ?, vat_period = ?,
          notes = ?, is_primary = ?,
          sub_business_number = ?, corporate_number = ?, business_category = ?,
          industry_code = ?, fiscal_year_start = ?, fiscal_year_end = ?,
          company_form = ?, fiscal_term = ?, hr_year = ?, priority = ?,
          updated_at = ?, updated_by = 'admin'
        WHERE id = ?
      `).bind(
        body.company_name || existing.company_name || null,
        normBiz || null,
        body.ceo_name || null,
        body.industry || null,
        body.business_type || null,
        body.tax_type || null,
        body.establishment_date || null,
        body.address || null,
        body.phone || null,
        body.employee_count != null && body.employee_count !== '' ? Number(body.employee_count) : null,
        body.last_revenue != null && body.last_revenue !== '' ? Number(body.last_revenue) : null,
        body.vat_period || null,
        body.notes || null,
        body.is_primary ? 1 : 0,
        subBizNo, corpNo,
        body.business_category || null,
        body.industry_code || null,
        body.fiscal_year_start || null,
        body.fiscal_year_end || null,
        body.company_form || null,
        body.fiscal_term != null && body.fiscal_term !== '' ? Number(body.fiscal_term) : null,
        body.hr_year != null && body.hr_year !== '' ? Number(body.hr_year) : null,
        body.priority != null && body.priority !== '' ? Number(body.priority) : null,
        now, existing.id
      ).run();
      return Response.json({ ok: true, id: existing.id, merged: true });
    }

    const result = await db.prepare(`
      INSERT INTO client_businesses (
        user_id, company_name, business_number, ceo_name, industry,
        business_type, tax_type, establishment_date, address, phone,
        employee_count, last_revenue, vat_period, notes, is_primary,
        sub_business_number, corporate_number, business_category,
        industry_code, fiscal_year_start, fiscal_year_end,
        company_form, fiscal_term, hr_year, priority,
        created_at, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin')
    `).bind(
      userId,
      body.company_name || null,
      normBiz || null,
      body.ceo_name || null,
      body.industry || null,
      body.business_type || null,
      body.tax_type || null,
      body.establishment_date || null,
      body.address || null,
      body.phone || null,
      body.employee_count != null && body.employee_count !== '' ? Number(body.employee_count) : null,
      body.last_revenue != null && body.last_revenue !== '' ? Number(body.last_revenue) : null,
      body.vat_period || null,
      body.notes || null,
      body.is_primary ? 1 : 0,
      subBizNo, corpNo,
      body.business_category || null,
      body.industry_code || null,
      body.fiscal_year_start || null,
      body.fiscal_year_end || null,
      body.company_form || null,
      body.fiscal_term != null && body.fiscal_term !== '' ? Number(body.fiscal_term) : null,
      body.hr_year != null && body.hr_year !== '' ? Number(body.hr_year) : null,
      body.priority != null && body.priority !== '' ? Number(body.priority) : null,
      now, now
    ).run();

    return Response.json({ ok: true, id: result.meta?.last_row_id });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// PUT 업데이트
export async function onRequestPut(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const id = url.searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });

  try {
    const body = await context.request.json();
    const now = kst();

    // 해당 id의 user_id 조회
    const existing = await db.prepare(`SELECT user_id FROM client_businesses WHERE id = ?`).bind(id).first();
    if (!existing) return Response.json({ ok: false, error: "not found" }, { status: 404 });

    if (body.is_primary) {
      await db.prepare(`UPDATE client_businesses SET is_primary = 0 WHERE user_id = ?`).bind(existing.user_id).run();
    }

    await db.prepare(`
      UPDATE client_businesses SET
        company_name = ?, business_number = ?, ceo_name = ?, industry = ?,
        business_type = ?, tax_type = ?, establishment_date = ?, address = ?,
        phone = ?, employee_count = ?, last_revenue = ?, vat_period = ?,
        notes = ?, is_primary = ?,
        sub_business_number = ?, corporate_number = ?, business_category = ?,
        industry_code = ?, fiscal_year_start = ?, fiscal_year_end = ?,
        company_form = ?, fiscal_term = ?, hr_year = ?,
        updated_at = ?, updated_by = 'admin'
      WHERE id = ?
    `).bind(
      body.company_name || null,
      (body.business_number || "").replace(/\D/g, "") || null,
      body.ceo_name || null,
      body.industry || null,
      body.business_type || null,
      body.tax_type || null,
      body.establishment_date || null,
      body.address || null,
      body.phone || null,
      body.employee_count != null && body.employee_count !== '' ? Number(body.employee_count) : null,
      body.last_revenue != null && body.last_revenue !== '' ? Number(body.last_revenue) : null,
      body.vat_period || null,
      body.notes || null,
      body.is_primary ? 1 : 0,
      String(body.sub_business_number || "").replace(/\D/g, "") || null,
      String(body.corporate_number || "").replace(/\D/g, "") || null,
      body.business_category || null,
      body.industry_code || null,
      body.fiscal_year_start || null,
      body.fiscal_year_end || null,
      body.company_form || null,
      body.fiscal_term != null && body.fiscal_term !== '' ? Number(body.fiscal_term) : null,
      body.hr_year != null && body.hr_year !== '' ? Number(body.hr_year) : null,
      body.priority != null && body.priority !== '' ? Number(body.priority) : null,
      now, id
    ).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// DELETE 삭제
export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const id = url.searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });

  try {
    await db.prepare(`DELETE FROM client_businesses WHERE id = ?`).bind(id).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
