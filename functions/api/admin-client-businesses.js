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
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const userId = url.searchParams.get("user_id");
  if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

  try {
    const { results } = await db.prepare(`
      SELECT * FROM client_businesses WHERE user_id = ?
      ORDER BY is_primary DESC, created_at ASC
    `).bind(userId).all();
    return Response.json({ businesses: results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST 신규 추가
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const userId = url.searchParams.get("user_id");
  if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

  try {
    const body = await context.request.json();
    const now = kst();

    // 주 사업장(is_primary) 설정 처리: 기존 주 사업장 해제
    if (body.is_primary) {
      await db.prepare(`UPDATE client_businesses SET is_primary = 0 WHERE user_id = ?`).bind(userId).run();
    }

    const result = await db.prepare(`
      INSERT INTO client_businesses (
        user_id, company_name, business_number, ceo_name, industry,
        business_type, tax_type, establishment_date, address, phone,
        employee_count, last_revenue, vat_period, notes, is_primary,
        created_at, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin')
    `).bind(
      userId,
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
      now, now
    ).run();

    return Response.json({ ok: true, id: result.meta?.last_row_id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PUT 업데이트
export async function onRequestPut(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  try {
    const body = await context.request.json();
    const now = kst();

    // 해당 id의 user_id 조회
    const existing = await db.prepare(`SELECT user_id FROM client_businesses WHERE id = ?`).bind(id).first();
    if (!existing) return Response.json({ error: "not found" }, { status: 404 });

    if (body.is_primary) {
      await db.prepare(`UPDATE client_businesses SET is_primary = 0 WHERE user_id = ?`).bind(existing.user_id).run();
    }

    await db.prepare(`
      UPDATE client_businesses SET
        company_name = ?, business_number = ?, ceo_name = ?, industry = ?,
        business_type = ?, tax_type = ?, establishment_date = ?, address = ?,
        phone = ?, employee_count = ?, last_revenue = ?, vat_period = ?,
        notes = ?, is_primary = ?, updated_at = ?, updated_by = 'admin'
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
      now, id
    ).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE 삭제
export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  try {
    await db.prepare(`DELETE FROM client_businesses WHERE id = ?`).bind(id).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
