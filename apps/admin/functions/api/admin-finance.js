// 거래처 재무 데이터 (매출/매입/세금) 관리
// - GET  ?key=&user_id= : 해당 거래처 모든 재무 데이터
// - GET  ?key=&action=summary&user_id= : 최근 4분기 + 12개월 요약 (chat.js용)
// - POST ?key=&action=upsert  : { user_id, period, ...fields } — period 기준 upsert
// - POST ?key=&action=bulk_import : { rows: [{...}, ...] } — PDF 처리 결과 일괄
// - POST ?key=&action=delete : { id } — 단건 삭제

import { checkAdmin, adminUnauthorized } from './_adminAuth.js';

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS client_finance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    business_id INTEGER,
    period TEXT NOT NULL,
    period_type TEXT DEFAULT 'monthly',
    revenue INTEGER,
    cost INTEGER,
    vat_payable INTEGER,
    vat_input INTEGER,
    vat_output INTEGER,
    income_tax INTEGER,
    taxable_income INTEGER,
    payroll_total INTEGER,
    withholding_total INTEGER,
    notes TEXT,
    source TEXT DEFAULT 'manual',
    source_file TEXT,
    created_by_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(user_id, business_id, period)
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_user_period ON client_finance(user_id, period DESC)`).run(); } catch {}
}

const FIELDS = ['business_id','period_type','revenue','cost','vat_payable','vat_input','vat_output','income_tax','taxable_income','payroll_total','withholding_total','notes','source','source_file'];

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('user_id');
  const businessId = url.searchParams.get('business_id');

  if (action === 'summary') {
    if (businessId) return getSummaryBiz(db, Number(businessId));
    if (!userId) return Response.json({ error: 'user_id 또는 business_id required' }, { status: 400 });
    return getSummary(db, userId);
  }

  /* 업체 단위 재무 — client_finance.business_id 기준 */
  if (businessId) {
    const { results } = await db.prepare(
      `SELECT * FROM client_finance WHERE business_id = ? ORDER BY period DESC LIMIT 200`
    ).bind(Number(businessId)).all();
    return Response.json({ rows: results || [] });
  }

  if (!userId) return Response.json({ error: 'user_id 또는 business_id required' }, { status: 400 });

  const { results } = await db.prepare(
    `SELECT * FROM client_finance WHERE user_id = ? ORDER BY period DESC LIMIT 200`
  ).bind(userId).all();
  return Response.json({ rows: results || [] });
}

async function getSummary(db, userId) {
  // 최근 12개월 + 최근 4분기 + 최근 3년 요약
  const { results: recent } = await db.prepare(
    `SELECT id, period, period_type, revenue, cost, vat_payable, income_tax, taxable_income, payroll_total, notes
     FROM client_finance WHERE user_id = ?
     ORDER BY period DESC LIMIT 24`
  ).bind(userId).all();

  if (!recent || !recent.length) return Response.json({ summary: null, has_data: false });

  // chat.js 가 사용하기 좋게 텍스트 요약도 같이
  const lines = ['[' + (recent[0].period) + '~' + (recent[recent.length-1].period) + ' 재무 데이터]'];
  for (const r of recent.slice(0, 12)) {
    const parts = [r.period];
    if (r.revenue != null) parts.push('매출 ' + r.revenue.toLocaleString('ko-KR'));
    if (r.cost != null) parts.push('매입 ' + r.cost.toLocaleString('ko-KR'));
    if (r.vat_payable != null) parts.push('부가세 ' + r.vat_payable.toLocaleString('ko-KR'));
    if (r.income_tax != null) parts.push('소득세 ' + r.income_tax.toLocaleString('ko-KR'));
    if (r.payroll_total != null) parts.push('인건비 ' + r.payroll_total.toLocaleString('ko-KR'));
    lines.push('  - ' + parts.join(' / '));
  }
  return Response.json({
    summary: lines.join('\n'),
    has_data: true,
    rows: recent,
    last_period: recent[0].period,
  });
}

/* 업체 단위 요약 — business_id 기준 */
async function getSummaryBiz(db, businessId) {
  const { results: recent } = await db.prepare(
    `SELECT id, period, period_type, revenue, cost, vat_payable, income_tax, taxable_income, payroll_total, notes
     FROM client_finance WHERE business_id = ?
     ORDER BY period DESC LIMIT 24`
  ).bind(businessId).all();
  if (!recent || !recent.length) return Response.json({ summary: null, has_data: false, rows: [] });
  const lines = ['[' + (recent[0].period) + '~' + (recent[recent.length-1].period) + ' 업체 재무]'];
  for (const r of recent.slice(0, 12)) {
    const parts = [r.period];
    if (r.revenue != null) parts.push('매출 ' + r.revenue.toLocaleString('ko-KR'));
    if (r.cost != null) parts.push('매입 ' + r.cost.toLocaleString('ko-KR'));
    if (r.vat_payable != null) parts.push('부가세 ' + r.vat_payable.toLocaleString('ko-KR'));
    if (r.income_tax != null) parts.push('소득세 ' + r.income_tax.toLocaleString('ko-KR'));
    if (r.payroll_total != null) parts.push('인건비 ' + r.payroll_total.toLocaleString('ko-KR'));
    lines.push('  - ' + parts.join(' / '));
  }
  return Response.json({
    summary: lines.join('\n'),
    has_data: true,
    rows: recent,
    last_period: recent[0].period,
  });
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'upsert';
  const body = await context.request.json().catch(() => ({}));
  const approverId = auth.userId || 0;

  if (action === 'delete') {
    const { id } = body;
    if (!id) return Response.json({ ok: false, error: 'id required' }, { status: 400 });
    await db.prepare(`DELETE FROM client_finance WHERE id = ?`).bind(id).run();
    return Response.json({ ok: true });
  }

  /* 사업장 또는 사람 단위 전체 비우기 — body { business_id } 또는 { user_id } */
  if (action === 'clear') {
    const bizId = body.business_id ? Number(body.business_id) : null;
    const uId = body.user_id ? Number(body.user_id) : null;
    if (!bizId && !uId) return Response.json({ ok: false, error: 'business_id 또는 user_id 필요' }, { status: 400 });
    try {
      let r;
      if (bizId) r = await db.prepare(`DELETE FROM client_finance WHERE business_id = ?`).bind(bizId).run();
      else r = await db.prepare(`DELETE FROM client_finance WHERE user_id = ?`).bind(uId).run();
      return Response.json({ ok: true, deleted: r.meta?.changes || 0 });
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  if (action === 'bulk_import') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let inserted = 0, updated = 0, failed = 0;
    for (const r of rows) {
      const res = await upsertRow(db, r, approverId);
      if (res.ok) {
        if (res.updated) updated++; else inserted++;
      } else failed++;
    }
    return Response.json({ ok: true, inserted, updated, failed, total: rows.length });
  }

  // 기본: upsert
  const res = await upsertRow(db, body, approverId);
  if (!res.ok) return Response.json({ error: res.error || 'failed' }, { status: 400 });
  return Response.json({ ok: true, id: res.id, updated: !!res.updated });
}

async function upsertRow(db, row, approverId) {
  if (!row || !row.user_id || !row.period) return { ok: false, error: 'user_id, period 필수' };
  const now = kst();
  const businessId = row.business_id || null;
  // 기존 행 확인
  const existing = await db.prepare(
    `SELECT id FROM client_finance WHERE user_id = ? AND COALESCE(business_id,0) = COALESCE(?,0) AND period = ?`
  ).bind(row.user_id, businessId, row.period).first();

  const sets = ['updated_at = ?'];
  const args = [now];
  for (const f of FIELDS) {
    if (row[f] !== undefined) {
      sets.push(`${f} = ?`);
      args.push(row[f]);
    }
  }

  if (existing) {
    args.push(existing.id);
    await db.prepare(`UPDATE client_finance SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    return { ok: true, id: existing.id, updated: true };
  }

  // INSERT
  const cols = ['user_id','period','business_id','created_by_id','created_at','updated_at'];
  const vals = [row.user_id, row.period, businessId, approverId, now, now];
  for (const f of FIELDS) {
    if (row[f] !== undefined && f !== 'business_id') {
      cols.push(f); vals.push(row[f]);
    }
  }
  const placeholders = cols.map(() => '?').join(',');
  const ins = await db.prepare(
    `INSERT INTO client_finance (${cols.join(',')}) VALUES (${placeholders})`
  ).bind(...vals).run();
  return { ok: true, id: ins.meta?.last_row_id, updated: false };
}
