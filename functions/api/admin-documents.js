// 세무 문서 AI 자동 분류 — 세무사(관리자)측 API
// - GET  /api/admin-documents?key=&status=&user_id=&from=&to=&month= → 문서 목록
// - GET  /api/admin-documents?key=&id=N → 단일 문서 상세
// - POST /api/admin-documents?key=&action=approve  body: {id, category?, note?}
// - POST /api/admin-documents?key=&action=reject   body: {id, reason, note?}
// - GET  /api/admin-documents?key=&action=stats&month=YYYY-MM → 비용·건수 집계

import { checkAdmin, adminUnauthorized } from './_adminAuth.js';

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTables(db) {
  // documents.js와 동일한 스키마. 혹시 먼저 호출돼도 문제없게.
  await db.prepare(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    room_id TEXT,
    doc_type TEXT NOT NULL,
    image_key TEXT NOT NULL,
    ocr_status TEXT DEFAULT 'pending',
    ocr_model TEXT,
    ocr_raw TEXT,
    ocr_confidence REAL,
    vendor TEXT,
    vendor_biz_no TEXT,
    amount INTEGER,
    vat_amount INTEGER,
    receipt_date TEXT,
    category TEXT,
    category_src TEXT,
    items TEXT,
    status TEXT DEFAULT 'pending',
    approver_id INTEGER,
    approved_at TEXT,
    reject_reason TEXT,
    note TEXT,
    created_at TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS ocr_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER,
    user_id INTEGER,
    model TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    cost_cents REAL,
    status TEXT,
    created_at TEXT
  )`).run();
}

// ============ GET ============
export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');

  if (action === 'stats') return await getStats(db, url);

  const id = url.searchParams.get('id');
  if (id) {
    const doc = await db.prepare(
      `SELECT d.*, u.real_name, u.name
       FROM documents d LEFT JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`
    ).bind(id).first();
    if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ document: doc });
  }

  const status = url.searchParams.get('status');   // pending|approved|rejected
  const userId = url.searchParams.get('user_id');
  const month = url.searchParams.get('month');     // YYYY-MM
  const from = url.searchParams.get('from');       // YYYY-MM-DD
  const to = url.searchParams.get('to');
  const docType = url.searchParams.get('doc_type');
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10));

  const clauses = ['1=1'];
  const args = [];
  if (status && ['pending','approved','rejected'].includes(status)) { clauses.push('d.status = ?'); args.push(status); }
  if (userId) { clauses.push('d.user_id = ?'); args.push(userId); }
  if (month) { clauses.push(`substr(d.created_at,1,7) = ?`); args.push(month); }
  if (from) { clauses.push(`substr(d.created_at,1,10) >= ?`); args.push(from); }
  if (to) { clauses.push(`substr(d.created_at,1,10) <= ?`); args.push(to); }
  if (docType) { clauses.push('d.doc_type = ?'); args.push(docType); }

  const rows = await db.prepare(
    `SELECT d.id, d.user_id, d.room_id, d.doc_type, d.ocr_status, d.ocr_confidence,
            d.vendor, d.vendor_biz_no, d.amount, d.vat_amount, d.receipt_date,
            d.category, d.category_src, d.status, d.approved_at, d.created_at, d.image_key,
            u.real_name, u.name
     FROM documents d LEFT JOIN users u ON d.user_id = u.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY d.created_at DESC LIMIT ?`
  ).bind(...args, limit).all();

  // 카운트 (상태별)
  const counts = {};
  try {
    const cnt = await db.prepare(
      `SELECT status, COUNT(*) AS c FROM documents GROUP BY status`
    ).all();
    (cnt.results || []).forEach(r => counts[r.status] = r.c);
  } catch {}

  return Response.json({ documents: rows.results || [], counts });
}

async function getStats(db, url) {
  const month = url.searchParams.get('month') || kst().substring(0, 7);

  // OCR 호출수·비용
  const usage = await db.prepare(
    `SELECT
       COUNT(*) AS calls,
       SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok,
       SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
       COALESCE(SUM(cost_cents), 0) AS cost_cents
     FROM ocr_usage_log
     WHERE substr(created_at,1,7) = ?`
  ).bind(month).first();

  // 문서 상태별
  const byStatus = await db.prepare(
    `SELECT status, COUNT(*) AS c FROM documents WHERE substr(created_at,1,7) = ? GROUP BY status`
  ).bind(month).all();

  // 타입별
  const byType = await db.prepare(
    `SELECT doc_type, COUNT(*) AS c FROM documents WHERE substr(created_at,1,7) = ? GROUP BY doc_type`
  ).bind(month).all();

  // 카테고리별 (금액 합)
  const byCategory = await db.prepare(
    `SELECT COALESCE(category,'(미분류)') AS category, COUNT(*) AS c, COALESCE(SUM(amount),0) AS total
     FROM documents WHERE substr(created_at,1,7) = ? AND status='approved' GROUP BY category
     ORDER BY total DESC`
  ).bind(month).all();

  // 고객별
  const byUser = await db.prepare(
    `SELECT d.user_id, u.real_name, u.name, COUNT(*) AS c, COALESCE(SUM(d.amount),0) AS total
     FROM documents d LEFT JOIN users u ON d.user_id = u.id
     WHERE substr(d.created_at,1,7) = ?
     GROUP BY d.user_id ORDER BY c DESC LIMIT 50`
  ).bind(month).all();

  return Response.json({
    month,
    usage: {
      calls: usage.calls || 0,
      ok: usage.ok || 0,
      failed: usage.failed || 0,
      cost_cents: Math.round((usage.cost_cents || 0) * 100) / 100,
      cost_krw: Math.round((usage.cost_cents || 0) * 14), // 1센트 ≈ 14원 (환율·환차 대충)
    },
    by_status: Object.fromEntries((byStatus.results || []).map(r => [r.status, r.c])),
    by_type: Object.fromEntries((byType.results || []).map(r => [r.doc_type, r.c])),
    by_category: byCategory.results || [],
    by_user: byUser.results || [],
  });
}

// ============ POST: 승인·반려·일괄처리 ============
export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const body = await context.request.json().catch(() => ({}));
  const approverId = auth.userId || 0; // owner는 0 (ADMIN_KEY)

  if (action === 'approve') {
    const { id, category, note, vendor, amount, vat_amount, receipt_date } = body;
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });

    // 선택적으로 필드 수정 병행
    const sets = ['status = ?', 'approver_id = ?', 'approved_at = ?'];
    const args = ['approved', approverId, kst()];
    if (category !== undefined) { sets.push('category = ?', "category_src = 'manual'"); args.push(category); }
    if (note !== undefined) { sets.push('note = ?'); args.push(note); }
    if (vendor !== undefined) { sets.push('vendor = ?'); args.push(vendor); }
    if (amount !== undefined) { sets.push('amount = ?'); args.push(amount); }
    if (vat_amount !== undefined) { sets.push('vat_amount = ?'); args.push(vat_amount); }
    if (receipt_date !== undefined) { sets.push('receipt_date = ?'); args.push(receipt_date); }
    args.push(id);

    await db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    return Response.json({ ok: true });
  }

  if (action === 'reject') {
    const { id, reason, note } = body;
    if (!id || !reason) return Response.json({ error: 'id/reason 필요' }, { status: 400 });
    const args = ['rejected', approverId, kst(), reason, note || null, id];
    await db.prepare(
      `UPDATE documents SET status = ?, approver_id = ?, approved_at = ?, reject_reason = ?, note = ? WHERE id = ?`
    ).bind(...args).run();
    return Response.json({ ok: true });
  }

  if (action === 'bulk_approve') {
    const { ids } = body;
    if (!Array.isArray(ids) || !ids.length) return Response.json({ error: 'ids 배열 필요' }, { status: 400 });
    const at = kst();
    for (const id of ids) {
      await db.prepare(
        `UPDATE documents SET status='approved', approver_id=?, approved_at=? WHERE id=? AND status='pending'`
      ).bind(approverId, at, id).run();
    }
    return Response.json({ ok: true, count: ids.length });
  }

  if (action === 'update') {
    // 세무사가 문서 필드 수정 (승인 여부와 무관)
    const { id } = body;
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
    const fields = ['vendor','vendor_biz_no','amount','vat_amount','receipt_date','category','note','doc_type'];
    const sets = [];
    const args = [];
    for (const f of fields) {
      if (body[f] !== undefined) {
        sets.push(`${f} = ?`);
        args.push(body[f]);
      }
    }
    if (body.category !== undefined) sets.push(`category_src = 'manual'`);
    if (!sets.length) return Response.json({ ok: true, updated: 0 });
    args.push(id);
    await db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
