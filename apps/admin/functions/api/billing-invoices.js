// 조정료 청구서 (billing_invoices)
// - GET    /api/billing-invoices                       → list (필터: status, staff_id, year, business_id, user_id)
// - GET    /api/billing-invoices?id=N                  → 단건
// - GET    /api/billing-invoices?scope=template        → 청구서 양식 1행
// - POST   /api/billing-invoices                       → 생성
// - POST   /api/billing-invoices?scope=template        → 양식 저장 (단일 row upsert)
// - PATCH  /api/billing-invoices?id=N                  → 수정 (할인·상태·발송·수금 등)
// - DELETE /api/billing-invoices?id=N                  → soft delete
//
// 인증: checkAdmin (ADMIN_KEY 또는 admin/owner 세션)
// 스키마: lazy CREATE — 기존 데이터 영향 0

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

function safeNum(v, def) {
  if (v === null || v === undefined || v === '') return def === undefined ? null : def;
  const n = Number(v);
  return Number.isFinite(n) ? n : (def === undefined ? null : def);
}

function safeStr(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return max ? s.slice(0, max) : s;
}

/* s2_items: array of {name, val, qty} → JSON string. 활증업무 — 양식 선택 + 직접 입력. */
function normalizeS2Items(input) {
  if (!input) return null;
  let arr = input;
  if (typeof input === 'string') {
    try { arr = JSON.parse(input); } catch { return null; }
  }
  if (!Array.isArray(arr)) return null;
  const safe = arr.filter(a => a && typeof a === 'object' && a.name)
    .slice(0, 50)
    .map(a => ({
      name: String(a.name).slice(0, 200),
      val: Number(a.val) || 0,
      qty: Number(a.qty) || 1,
    }));
  return safe.length ? JSON.stringify(safe) : null;
}

/* s3_items: array of {code, name, amt, billable, rule, addition} → JSON string */
function normalizeS3Items(input) {
  if (!input) return null;
  let arr = input;
  if (typeof input === 'string') {
    try { arr = JSON.parse(input); } catch { return null; }
  }
  if (!Array.isArray(arr)) return null;
  const safe = arr.filter(a => a && typeof a === 'object' && a.code)
    .slice(0, 50)
    .map(a => ({
      code: String(a.code).slice(0, 50),
      name: String(a.name || '').slice(0, 200),
      amt: Number(a.amt) || 0,
      billable: a.billable === true || a.billable === 1 ? 1 : 0,
      rule: String(a.rule || 'none').slice(0, 30),
      addition: Number(a.addition) || 0,
    }));
  return safe.length ? JSON.stringify(safe) : null;
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS billing_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER,
    user_id INTEGER,
    filing_id INTEGER,
    year INTEGER,
    tax_type TEXT,
    revenue INTEGER,
    asset INTEGER,
    biz_type TEXT,
    basic_type TEXT,
    base_fee INTEGER DEFAULT 0,
    s3_addition INTEGER DEFAULT 0,
    discount INTEGER DEFAULT 0,
    total_fee INTEGER DEFAULT 0,
    s3_items TEXT,
    staff_user_id INTEGER,
    staff_override INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    paid_at TEXT,
    paid_amount INTEGER,
    note TEXT,
    created_by_user_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_business ON billing_invoices(business_id, year DESC)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_status ON billing_invoices(status, created_at DESC)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_staff ON billing_invoices(staff_user_id, status)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_year ON billing_invoices(year, tax_type)`).run(); } catch {}
  /* Phase X Step 4 (2026-05-20): Section 2 (활증업무) — lazy ALTER */
  try { await db.prepare(`ALTER TABLE billing_invoices ADD COLUMN s2_addition INTEGER DEFAULT 0`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE billing_invoices ADD COLUMN s2_items TEXT`).run(); } catch {}

  await db.prepare(`CREATE TABLE IF NOT EXISTS billing_template (
    id INTEGER PRIMARY KEY,
    greeting TEXT,
    bank_info TEXT,
    office_address TEXT,
    office_phone TEXT,
    signature_text TEXT,
    fee_rule_indv TEXT,
    fee_rule_corp TEXT,
    updated_at TEXT
  )`).run();
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const scope = url.searchParams.get("scope");
  const id = safeNum(url.searchParams.get("id"));

  /* 양식 조회 (단일 row, id=1) */
  if (scope === 'template') {
    const row = await db.prepare(`SELECT * FROM billing_template WHERE id = 1`).first();
    return Response.json({ ok: true, template: row || null });
  }

  /* 단건 조회 */
  if (id) {
    const row = await db.prepare(`
      SELECT i.*, b.company_name AS business_name, COALESCE(u.real_name, u.name) AS user_name,
             COALESCE(s.real_name, s.name) AS staff_name
        FROM billing_invoices i
        LEFT JOIN businesses b ON i.business_id = b.id
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN users s ON i.staff_user_id = s.id
       WHERE i.id = ? AND i.deleted_at IS NULL
    `).bind(id).first();
    if (!row) return Response.json({ error: 'not found' }, { status: 404 });
    if (row.s3_items) { try { row.s3_items_parsed = JSON.parse(row.s3_items); } catch {} }
    return Response.json({ ok: true, invoice: row });
  }

  /* list 조회 (필터) */
  const filters = [];
  const binds = [];
  const status = url.searchParams.get("status");
  const staffId = safeNum(url.searchParams.get("staff_id"));
  const year = safeNum(url.searchParams.get("year"));
  const bizId = safeNum(url.searchParams.get("business_id"));
  const userId = safeNum(url.searchParams.get("user_id"));
  const taxType = url.searchParams.get("tax_type");

  filters.push(`i.deleted_at IS NULL`);
  if (status) { filters.push(`i.status = ?`); binds.push(status); }
  if (staffId) { filters.push(`i.staff_user_id = ?`); binds.push(staffId); }
  if (year) { filters.push(`i.year = ?`); binds.push(year); }
  if (bizId) { filters.push(`i.business_id = ?`); binds.push(bizId); }
  if (userId) { filters.push(`i.user_id = ?`); binds.push(userId); }
  if (taxType) { filters.push(`i.tax_type = ?`); binds.push(taxType); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { results } = await db.prepare(`
    SELECT i.id, i.business_id, i.user_id, i.filing_id, i.year, i.tax_type,
           i.revenue, i.base_fee, i.s2_addition, i.s3_addition, i.discount, i.total_fee,
           i.staff_user_id, i.staff_override, i.status, i.sent_at, i.paid_at, i.paid_amount,
           i.created_at, i.updated_at,
           b.company_name AS business_name,
           COALESCE(u.real_name, u.name) AS user_name,
           COALESCE(s.real_name, s.name) AS staff_name
      FROM billing_invoices i
      LEFT JOIN businesses b ON i.business_id = b.id
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN users s ON i.staff_user_id = s.id
      ${where}
     ORDER BY i.created_at DESC
     LIMIT 500
  `).bind(...binds).all();

  /* 담당자별 그룹 카운트 (모아보기 화면용) */
  const { results: byStaff } = await db.prepare(`
    SELECT i.staff_user_id, COALESCE(s.real_name, s.name) AS staff_name,
           COUNT(*) AS total,
           SUM(CASE WHEN i.status = 'pending' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN i.status = 'sent' THEN 1 ELSE 0 END) AS sent,
           SUM(CASE WHEN i.status = 'paid' THEN 1 ELSE 0 END) AS paid,
           SUM(CASE WHEN i.status != 'paid' THEN i.total_fee ELSE 0 END) AS outstanding_amount
      FROM billing_invoices i
      LEFT JOIN users s ON i.staff_user_id = s.id
     WHERE i.deleted_at IS NULL
     GROUP BY i.staff_user_id
  `).all();

  return Response.json({ ok: true, invoices: results || [], by_staff: byStaff || [] });
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const scope = url.searchParams.get("scope");
  let body = {};
  try { body = await context.request.json(); } catch {}

  /* 양식 저장 (단일 row upsert) */
  if (scope === 'template') {
    const now = kst();
    const row = {
      greeting: safeStr(body.greeting, 2000),
      bank_info: safeStr(body.bank_info, 500),
      office_address: safeStr(body.office_address, 300),
      office_phone: safeStr(body.office_phone, 100),
      signature_text: safeStr(body.signature_text, 200),
      fee_rule_indv: body.fee_rule_indv ? JSON.stringify(body.fee_rule_indv) : null,
      fee_rule_corp: body.fee_rule_corp ? JSON.stringify(body.fee_rule_corp) : null,
    };
    await db.prepare(`
      INSERT INTO billing_template (id, greeting, bank_info, office_address, office_phone, signature_text, fee_rule_indv, fee_rule_corp, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        greeting = excluded.greeting,
        bank_info = excluded.bank_info,
        office_address = excluded.office_address,
        office_phone = excluded.office_phone,
        signature_text = excluded.signature_text,
        fee_rule_indv = excluded.fee_rule_indv,
        fee_rule_corp = excluded.fee_rule_corp,
        updated_at = excluded.updated_at
    `).bind(row.greeting, row.bank_info, row.office_address, row.office_phone, row.signature_text, row.fee_rule_indv, row.fee_rule_corp, now).run();
    return Response.json({ ok: true });
  }

  /* 청구서 생성 */
  const now = kst();
  const businessId = safeNum(body.business_id);
  const userId = safeNum(body.user_id);
  if (!businessId && !userId) {
    return Response.json({ error: 'business_id or user_id required' }, { status: 400 });
  }

  const row = {
    business_id: businessId,
    user_id: userId,
    filing_id: safeNum(body.filing_id),
    year: safeNum(body.year, new Date().getFullYear()),
    tax_type: safeStr(body.tax_type, 30),
    revenue: safeNum(body.revenue, 0),
    asset: safeNum(body.asset, 0),
    biz_type: safeStr(body.biz_type, 100),
    basic_type: safeStr(body.basic_type, 100),
    base_fee: safeNum(body.base_fee, 0),
    s2_addition: safeNum(body.s2_addition, 0),
    s3_addition: safeNum(body.s3_addition, 0),
    discount: safeNum(body.discount, 0),
    total_fee: safeNum(body.total_fee, 0),
    s2_items: normalizeS2Items(body.s2_items),
    s3_items: normalizeS3Items(body.s3_items),
    staff_user_id: safeNum(body.staff_user_id),
    staff_override: body.staff_override ? 1 : 0,
    status: safeStr(body.status, 30) || 'pending',
    note: safeStr(body.note, 1000),
    created_by_user_id: auth.userId || null,
  };

  const result = await db.prepare(`
    INSERT INTO billing_invoices (
      business_id, user_id, filing_id, year, tax_type,
      revenue, asset, biz_type, basic_type,
      base_fee, s2_addition, s3_addition, discount, total_fee, s2_items, s3_items,
      staff_user_id, staff_override, status, note, created_by_user_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    row.business_id, row.user_id, row.filing_id, row.year, row.tax_type,
    row.revenue, row.asset, row.biz_type, row.basic_type,
    row.base_fee, row.s2_addition, row.s3_addition, row.discount, row.total_fee, row.s2_items, row.s3_items,
    row.staff_user_id, row.staff_override, row.status, row.note, row.created_by_user_id,
    now, now,
  ).run();

  return Response.json({ ok: true, id: result.meta?.last_row_id || null });
}

export async function onRequestPatch(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = safeNum(url.searchParams.get("id"));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  let body = {};
  try { body = await context.request.json(); } catch {}

  const exists = await db.prepare(`SELECT id FROM billing_invoices WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
  if (!exists) return Response.json({ error: 'not found' }, { status: 404 });

  /* 부분 update — null 안 들어온 필드만 갱신 */
  const fields = [];
  const binds = [];
  const setField = (col, val) => { fields.push(`${col} = ?`); binds.push(val); };

  if ('revenue' in body) setField('revenue', safeNum(body.revenue, 0));
  if ('asset' in body) setField('asset', safeNum(body.asset, 0));
  if ('biz_type' in body) setField('biz_type', safeStr(body.biz_type, 100));
  if ('basic_type' in body) setField('basic_type', safeStr(body.basic_type, 100));
  if ('base_fee' in body) setField('base_fee', safeNum(body.base_fee, 0));
  if ('s3_addition' in body) setField('s3_addition', safeNum(body.s3_addition, 0));
  if ('discount' in body) setField('discount', safeNum(body.discount, 0));
  if ('total_fee' in body) setField('total_fee', safeNum(body.total_fee, 0));
  if ('s2_addition' in body) setField('s2_addition', safeNum(body.s2_addition, 0));
  if ('s2_items' in body) setField('s2_items', normalizeS2Items(body.s2_items));
  if ('s3_items' in body) setField('s3_items', normalizeS3Items(body.s3_items));
  if ('staff_user_id' in body) setField('staff_user_id', safeNum(body.staff_user_id));
  if ('staff_override' in body) setField('staff_override', body.staff_override ? 1 : 0);
  if ('note' in body) setField('note', safeStr(body.note, 1000));
  if ('tax_type' in body) setField('tax_type', safeStr(body.tax_type, 30));
  if ('year' in body) setField('year', safeNum(body.year));

  /* 상태 변경 — 발송·수금 자동 timestamp */
  if ('status' in body) {
    const status = safeStr(body.status, 30);
    setField('status', status);
    if (status === 'sent' && !('sent_at' in body)) setField('sent_at', kst());
    if (status === 'paid' && !('paid_at' in body)) setField('paid_at', kst());
  }
  if ('sent_at' in body) setField('sent_at', safeStr(body.sent_at, 30));
  if ('paid_at' in body) setField('paid_at', safeStr(body.paid_at, 30));
  if ('paid_amount' in body) setField('paid_amount', safeNum(body.paid_amount, 0));

  if (!fields.length) return Response.json({ ok: true, no_change: true });

  setField('updated_at', kst());
  binds.push(id);
  await db.prepare(`UPDATE billing_invoices SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();

  return Response.json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = safeNum(url.searchParams.get("id"));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const exists = await db.prepare(`SELECT id FROM billing_invoices WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
  if (!exists) return Response.json({ error: 'not found' }, { status: 404 });

  await db.prepare(`UPDATE billing_invoices SET deleted_at = ?, updated_at = ? WHERE id = ?`).bind(kst(), kst(), id).run();
  return Response.json({ ok: true });
}
