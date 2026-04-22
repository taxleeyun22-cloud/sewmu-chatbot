// 세무 신고 Case — 거래처 × 신고종류 × 기간 단위 업무 묶음
//
// GET  /api/tax-filings?user_id=X           → 이 거래처의 신고 Case 리스트
// GET  /api/tax-filings?user_id=X&status=active → 진행중만
// GET  /api/tax-filings?action=due_soon     → 전체 거래처 기한 임박 Case (D-14 이내)
// POST /api/tax-filings                      → 새 Case 생성 { user_id, filing_type, period, title?, due_date? }
//   → 자동으로 기본 템플릿 체크리스트 항목 생성
// PATCH /api/tax-filings?id=N               → 수정 { title?, due_date?, status?, notes? }
// DELETE /api/tax-filings?id=N              → soft delete
//
// POST /api/tax-filings?action=toggle_item&item_id=N   → 체크리스트 항목 체크/해제
// POST /api/tax-filings?action=add_item&filing_id=N    → 체크리스트 항목 추가 { item_text }
// DELETE /api/tax-filings?action=del_item&item_id=N    → 체크리스트 항목 삭제

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

const FILING_TYPES = ['부가세', '종소세', '법인세', '원천세', '양도세', '기타'];
const STATUSES = ['active', 'completed', 'cancelled'];

/* 신고 종류별 기본 체크리스트 템플릿 */
const TEMPLATES = {
  '부가세': [
    '매출 세금계산서 발행 확인',
    '매입 세금계산서 수취 확인',
    '카드 매출·현금영수증 집계',
    '신용카드 매입 자료 집계',
    '면세 매출 분리',
    '공제 가능 매입세액 검토',
    '간이과세·일반과세 적용 확인',
    '신고서 초안 작성',
    '고객 검토·승인',
    '홈택스 전자신고',
    '납부 완료 확인',
  ],
  '종소세': [
    '사업소득 매출 집계',
    '경비 영수증 집계',
    '인건비 (일용직·상용직 포함) 정리',
    '임대료·통신비·공과금 집계',
    '기타 공제 자료 (보험료·의료비·기부금)',
    '가족 인적공제 확인',
    '전년도 이월 결손금 확인',
    '종합소득세 계산서 작성',
    '지방소득세 함께 신고',
    '홈택스 전자신고',
    '납부 완료 확인',
    '원천세 최종 정산',
  ],
  '법인세': [
    '재무제표 확정 (매출·매입·경비)',
    '세무조정 사항 정리',
    '감가상각비 계산',
    '접대비 한도 확인',
    '퇴직급여충당금 설정',
    '기부금 공제 대상 확인',
    '이월결손금 공제',
    '세액공제·감면 적용',
    '법인세 신고서 작성',
    '지방법인세 포함',
    '홈택스 전자신고',
    '납부 완료 확인',
  ],
  '원천세': [
    '근로소득 원천징수 확인',
    '사업소득·기타소득 원천징수',
    '간이세액표 적용',
    '4대보험 공제 확인',
    '지급명세서 제출',
    '홈택스 전자신고',
    '납부 완료 확인',
  ],
  '양도세': [
    '양도가액 확인',
    '취득가액 확인',
    '필요경비 (중개수수료·법무비 등)',
    '장기보유특별공제 적용',
    '기본공제 250만원',
    '세율 적용 (보유기간·세대별)',
    '양도소득세 계산서 작성',
    '홈택스 전자신고',
    '납부 완료 확인',
  ],
  '기타': [],
};

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS tax_filings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filing_type TEXT NOT NULL,
    period TEXT NOT NULL,
    title TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'active',
    created_by TEXT,
    notes TEXT,
    created_at TEXT,
    updated_at TEXT,
    completed_at TEXT,
    deleted_at TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS tax_filing_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filing_id INTEGER NOT NULL,
    item_text TEXT NOT NULL,
    item_order INTEGER DEFAULT 0,
    is_checked INTEGER DEFAULT 0,
    checked_at TEXT,
    checked_by TEXT,
    notes TEXT,
    linked_doc_id INTEGER,
    created_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_filings_user ON tax_filings(user_id, status)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_filings_due ON tax_filings(due_date, status)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_items_filing ON tax_filing_items(filing_id, item_order)`).run(); } catch {}
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get("action");

  /* 기한 임박 Case — 대시보드용 */
  if (action === 'due_soon') {
    try {
      const { results } = await db.prepare(
        `SELECT f.id, f.user_id, f.filing_type, f.period, f.title, f.due_date, f.status,
                u.real_name, u.name,
                (SELECT COUNT(*) FROM tax_filing_items WHERE filing_id = f.id AND is_checked = 0) AS pending_items,
                (SELECT COUNT(*) FROM tax_filing_items WHERE filing_id = f.id) AS total_items
         FROM tax_filings f
         LEFT JOIN users u ON f.user_id = u.id
         WHERE f.deleted_at IS NULL AND f.status = 'active' AND f.due_date IS NOT NULL
           AND date(f.due_date) <= date('now', '+14 days')
         ORDER BY f.due_date ASC LIMIT 100`
      ).all();
      return Response.json({ ok: true, filings: results || [] });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  const userId = Number(url.searchParams.get("user_id") || 0);
  if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
  const statusFilter = url.searchParams.get("status") || 'active';

  try {
    const statusClause = statusFilter === 'all' ? '' : ` AND status = '${statusFilter.replace(/[^a-z]/g, '')}'`;
    const { results: filings } = await db.prepare(
      `SELECT id, user_id, filing_type, period, title, due_date, status, created_by, notes,
              created_at, updated_at, completed_at
       FROM tax_filings
       WHERE user_id = ? AND deleted_at IS NULL ${statusClause}
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
         COALESCE(due_date, '9999-99-99') ASC,
         created_at DESC
       LIMIT 50`
    ).bind(userId).all();

    /* 각 filing 의 체크리스트 items 포함 */
    const ids = (filings || []).map(f => f.id);
    let itemsByFiling = {};
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const { results: items } = await db.prepare(
        `SELECT id, filing_id, item_text, item_order, is_checked, checked_at, checked_by, notes
         FROM tax_filing_items
         WHERE filing_id IN (${placeholders})
         ORDER BY item_order ASC, id ASC`
      ).bind(...ids).all();
      for (const it of (items || [])) {
        (itemsByFiling[it.filing_id] = itemsByFiling[it.filing_id] || []).push(it);
      }
    }
    const result = (filings || []).map(f => ({ ...f, items: itemsByFiling[f.id] || [] }));
    return Response.json({ ok: true, filings: result, filing_types: FILING_TYPES });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get("action") || 'create';
  const now = kst();
  const authorName = auth.name || auth.realName || (auth.owner ? '대표' : '담당자');

  let body;
  try { body = await context.request.json(); } catch { body = {}; }

  /* === 체크리스트 항목 토글 === */
  if (action === 'toggle_item') {
    const itemId = Number(url.searchParams.get("item_id") || 0);
    if (!itemId) return Response.json({ error: "item_id required" }, { status: 400 });
    try {
      const row = await db.prepare(`SELECT is_checked FROM tax_filing_items WHERE id = ?`).bind(itemId).first();
      if (!row) return Response.json({ error: "not_found" }, { status: 404 });
      const newChecked = row.is_checked ? 0 : 1;
      await db.prepare(
        `UPDATE tax_filing_items SET is_checked = ?, checked_at = ?, checked_by = ? WHERE id = ?`
      ).bind(newChecked, newChecked ? now : null, newChecked ? authorName : null, itemId).run();
      return Response.json({ ok: true, is_checked: newChecked });
    } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
  }

  /* === 항목 추가 === */
  if (action === 'add_item') {
    const filingId = Number(url.searchParams.get("filing_id") || 0);
    const itemText = String(body.item_text || '').trim().slice(0, 200);
    if (!filingId || !itemText) return Response.json({ error: "filing_id + item_text required" }, { status: 400 });
    try {
      const maxR = await db.prepare(
        `SELECT COALESCE(MAX(item_order), 0) AS m FROM tax_filing_items WHERE filing_id = ?`
      ).bind(filingId).first();
      const nextOrder = (maxR?.m || 0) + 10;
      const r = await db.prepare(
        `INSERT INTO tax_filing_items (filing_id, item_text, item_order, created_at) VALUES (?, ?, ?, ?)`
      ).bind(filingId, itemText, nextOrder, now).run();
      return Response.json({ ok: true, id: r.meta?.last_row_id });
    } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
  }

  /* === 새 Case 생성 === */
  const userId = Number(body.user_id || 0);
  const filingType = FILING_TYPES.includes(body.filing_type) ? body.filing_type : '기타';
  const period = String(body.period || '').trim().slice(0, 30);
  const title = String(body.title || '').trim().slice(0, 100) || `${filingType} · ${period}`;
  const dueDate = body.due_date && validDate(body.due_date) ? body.due_date : null;
  const notes = String(body.notes || '').trim().slice(0, 1000);
  if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
  if (!period) return Response.json({ error: "period required (예: 2026-1기, 2025)" }, { status: 400 });

  try {
    const r = await db.prepare(
      `INSERT INTO tax_filings (user_id, filing_type, period, title, due_date, status, created_by, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
    ).bind(userId, filingType, period, title, dueDate, authorName, notes || null, now, now).run();
    const filingId = r.meta?.last_row_id;

    /* 기본 템플릿 체크리스트 항목 자동 추가 */
    const tmpl = TEMPLATES[filingType] || [];
    for (let i = 0; i < tmpl.length; i++) {
      await db.prepare(
        `INSERT INTO tax_filing_items (filing_id, item_text, item_order, created_at) VALUES (?, ?, ?, ?)`
      ).bind(filingId, tmpl[i], (i + 1) * 10, now).run();
    }
    return Response.json({ ok: true, id: filingId, items_created: tmpl.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get("id") || 0);
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const fields = [], binds = [];
  if (body.title !== undefined) { fields.push('title = ?'); binds.push(String(body.title || '').slice(0, 100)); }
  if (body.due_date !== undefined) {
    if (!body.due_date) { fields.push('due_date = NULL'); }
    else if (validDate(body.due_date)) { fields.push('due_date = ?'); binds.push(body.due_date); }
    else return Response.json({ error: "invalid due_date" }, { status: 400 });
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return Response.json({ error: "invalid status" }, { status: 400 });
    fields.push('status = ?'); binds.push(body.status);
    if (body.status === 'completed') { fields.push('completed_at = ?'); binds.push(kst()); }
  }
  if (body.notes !== undefined) { fields.push('notes = ?'); binds.push(String(body.notes || '').slice(0, 1000)); }
  if (!fields.length) return Response.json({ error: "nothing to update" }, { status: 400 });
  fields.push('updated_at = ?'); binds.push(kst());
  binds.push(id);

  try {
    await db.prepare(`UPDATE tax_filings SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).bind(...binds).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get("action");

  /* 체크리스트 항목 삭제 */
  if (action === 'del_item') {
    const itemId = Number(url.searchParams.get("item_id") || 0);
    if (!itemId) return Response.json({ error: "item_id required" }, { status: 400 });
    try {
      await db.prepare(`DELETE FROM tax_filing_items WHERE id = ?`).bind(itemId).run();
      return Response.json({ ok: true });
    } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
  }

  /* 필링 soft delete */
  const id = Number(url.searchParams.get("id") || 0);
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    await db.prepare(`UPDATE tax_filings SET deleted_at = ? WHERE id = ?`).bind(kst(), id).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
