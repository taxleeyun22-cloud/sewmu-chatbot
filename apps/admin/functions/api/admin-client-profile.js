// 관리자: 거래처 정보(client_profiles) 조회/저장/삭제
// CSV 일괄 업로드는 admin-client-profile-bulk.js 로 분리

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS client_profiles (
    user_id INTEGER PRIMARY KEY,
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
    updated_at TEXT,
    updated_by TEXT
  )`).run();

  // 컬럼 추가(이미 생성된 DB 대응)
  const addCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await addCol(`ALTER TABLE client_profiles ADD COLUMN last_revenue INTEGER`);
  await addCol(`ALTER TABLE client_profiles ADD COLUMN vat_period TEXT`);
  await addCol(`ALTER TABLE client_profiles ADD COLUMN establishment_date TEXT`);
}

// GET /api/admin-client-profile?user_id=123
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const userId = url.searchParams.get("user_id");
  if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

  try {
    const profile = await db.prepare(
      `SELECT * FROM client_profiles WHERE user_id = ?`
    ).bind(userId).first();
    return Response.json({ profile: profile || null });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin-client-profile  (저장/업데이트, upsert)
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTable(db);

  try {
    const body = await context.request.json();
    const userId = body.user_id;
    if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

    const fields = {
      company_name: body.company_name || null,
      business_number: body.business_number || null,
      ceo_name: body.ceo_name || null,
      industry: body.industry || null,
      business_type: body.business_type || null, // 개인/법인
      tax_type: body.tax_type || null, // 일반/간이/면세/법인
      establishment_date: body.establishment_date || null,
      address: body.address || null,
      phone: body.phone || null,
      employee_count: body.employee_count != null ? Number(body.employee_count) : null,
      last_revenue: body.last_revenue != null ? Number(body.last_revenue) : null,
      vat_period: body.vat_period || null,
      notes: body.notes || null,
      updated_at: kst,
      updated_by: 'admin',
    };

    await db.prepare(`
      INSERT INTO client_profiles (
        user_id, company_name, business_number, ceo_name, industry,
        business_type, tax_type, establishment_date, address, phone,
        employee_count, last_revenue, vat_period, notes, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        company_name = excluded.company_name,
        business_number = excluded.business_number,
        ceo_name = excluded.ceo_name,
        industry = excluded.industry,
        business_type = excluded.business_type,
        tax_type = excluded.tax_type,
        establishment_date = excluded.establishment_date,
        address = excluded.address,
        phone = excluded.phone,
        employee_count = excluded.employee_count,
        last_revenue = excluded.last_revenue,
        vat_period = excluded.vat_period,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(
      userId,
      fields.company_name, fields.business_number, fields.ceo_name,
      fields.industry, fields.business_type, fields.tax_type,
      fields.establishment_date, fields.address, fields.phone,
      fields.employee_count, fields.last_revenue, fields.vat_period,
      fields.notes, fields.updated_at, fields.updated_by
    ).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/admin-client-profile?user_id=123
export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTable(db);

  const userId = url.searchParams.get("user_id");
  if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

  try {
    await db.prepare(`DELETE FROM client_profiles WHERE user_id = ?`).bind(userId).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
