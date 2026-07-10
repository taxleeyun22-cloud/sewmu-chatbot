/**
 * 💼 영업 파이프라인 (2026-07-08 사장님 명령: "영업쪽 전반적으로 관리되도록" → 흐름도 확정 후 "만들었어??")
 *
 * 설계 원칙 (허브스팟 타임라인 + 파이프드라이브 다음액션 벤치마킹):
 *  - "체크 = 단계 이동" 아님. 활동을 기록하면 결과에 따라 단계가 자동으로 따라옴.
 *  - 진행중 리드는 반드시 next_action_date 를 가짐 (없으면 저장 거부) — 잊혀 죽는 리드 방지.
 *
 * Endpoints (전부 checkAdmin — 직원 공용 도구. 삭제만 admin 이상):
 *   GET  /api/sales-pipeline?view=list&stage=&assignee_id=&q=   → 리드 목록 + 요약 카운트
 *   GET  /api/sales-pipeline?view=today                          → 오늘/지난 팔로업 (홈 카드용)
 *   GET  /api/sales-pipeline?view=meta                           → 직원 목록 + 승인대기(챗봇 리드 후보)
 *   GET  /api/sales-pipeline?id=N                                → 리드 1건 + 활동 타임라인
 *   POST /api/sales-pipeline                                     → 리드 생성 (next_action_date 필수)
 *   POST /api/sales-pipeline?action=log                          → 활동 기록 + 결과 → 단계 자동 이동
 *   PATCH /api/sales-pipeline                                    → 리드 수정 (단계 수동 변경·담당 변경 등)
 *   DELETE /api/sales-pipeline?id=N                              → soft delete (admin 이상)
 */

import { checkAdmin, adminUnauthorized, hasAdminRole, roleForbidden, checkOriginCsrf } from "./_adminAuth.js";
import { logAudit } from "./_audit.js";

const KST_OFFSET = 9 * 60 * 60 * 1000;
function kst() {
  return new Date(Date.now() + KST_OFFSET).toISOString().replace('T', ' ').substring(0, 19);
}
function todayKST() {
  return new Date(Date.now() + KST_OFFSET).toISOString().substring(0, 10);
}

const STAGES = ['lead', 'contacted', 'consulting', 'proposal', 'won', 'hold', 'lost'];
const LEAD_TYPES = ['pension', 'insurance', 'incorporation', 'income', 'new_biz', 'referral', 'other'];
const SOURCES = ['target', 'chatbot', 'manual'];
const RESULTS = ['called', 'missed', 'meeting', 'sent', 'won', 'lost', 'hold', 'note'];
/* 결과 → 단계 자동 매핑. null = 단계 유지. called 는 lead 에서만 contacted 로 승격. */
const RESULT_STAGE = {
  called: 'contacted', missed: null, meeting: 'consulting', sent: 'proposal',
  won: 'won', lost: 'lost', hold: 'hold', note: null,
};
/* 진행형 결과 = 다음 액션 날짜 필수 */
const ONGOING = ['called', 'missed', 'meeting', 'sent', 'note'];

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS sales_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    lead_type TEXT NOT NULL DEFAULT 'other',
    source TEXT NOT NULL DEFAULT 'manual',
    ref_owner_type TEXT,
    ref_owner_id INTEGER,
    stage TEXT NOT NULL DEFAULT 'lead',
    assignee_user_id INTEGER,
    assignee_name TEXT,
    next_action TEXT,
    next_action_date TEXT,
    lost_reason TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    won_at TEXT,
    deleted_at TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS sales_lead_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'note',
    content TEXT,
    result TEXT,
    stage_after TEXT,
    actor_name TEXT,
    created_at TEXT NOT NULL
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_leads_list ON sales_leads(deleted_at, stage, next_action_date)`).run(); } catch (_) {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_lead_logs ON sales_lead_logs(lead_id, created_at DESC)`).run(); } catch (_) {}
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

function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

/* 진행중 단계인지 (팔로업 대상) */
const ACTIVE_STAGES = ['lead', 'contacted', 'consulting', 'proposal', 'hold'];

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id'));
  const view = url.searchParams.get('view') || 'list';
  const today = todayKST();

  try {
    /* ── 리드 1건 + 타임라인 ── */
    if (id) {
      const lead = await db.prepare(`SELECT * FROM sales_leads WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
      if (!lead) return Response.json({ error: 'not found' }, { status: 404 });
      const { results: logs } = await db.prepare(
        `SELECT id, kind, content, result, stage_after, actor_name, created_at
         FROM sales_lead_logs WHERE lead_id = ? ORDER BY created_at DESC, id DESC LIMIT 200`
      ).bind(id).all();
      return Response.json({ ok: true, lead, logs: logs || [] });
    }

    /* ── 홈 카드: 오늘/지난 팔로업 ── */
    if (view === 'today') {
      const { results } = await db.prepare(
        `SELECT id, name, company, lead_type, stage, next_action, next_action_date, assignee_name
         FROM sales_leads
         WHERE deleted_at IS NULL AND stage IN (${ACTIVE_STAGES.map(() => '?').join(',')})
           AND next_action_date IS NOT NULL AND next_action_date <= ?
         ORDER BY next_action_date ASC LIMIT 30`
      ).bind(...ACTIVE_STAGES, today).all();
      const rows = results || [];
      const overdue = rows.filter(r => r.next_action_date < today).length;
      return Response.json({ ok: true, today, count: rows.length, overdue, items: rows });
    }

    /* ── meta: 담당자 후보(직원) + 승인대기 챗봇 리드 후보 ── */
    if (view === 'meta') {
      let staff = [];
      try {
        const { results } = await db.prepare(
          `SELECT id, COALESCE(real_name, name) AS name FROM users
           WHERE (is_admin = 1 OR (admin_role IS NOT NULL AND admin_role != ''))
             AND (approval_status IS NULL OR approval_status NOT IN ('deleted','merged','withdrawn'))
           ORDER BY id ASC LIMIT 50`
        ).all();
        staff = results || [];
      } catch (_) {}
      let pending = [];
      try {
        const { results } = await db.prepare(
          `SELECT u.id, COALESCE(u.real_name, u.name) AS name, u.phone, u.created_at
           FROM users u
           WHERE u.approval_status = 'pending'
             AND NOT EXISTS (SELECT 1 FROM sales_leads l WHERE l.ref_owner_type = 'User' AND l.ref_owner_id = u.id AND l.deleted_at IS NULL)
           ORDER BY u.created_at DESC LIMIT 30`
        ).all();
        pending = results || [];
      } catch (_) {}
      return Response.json({ ok: true, staff, pending });
    }

    /* ── 목록 + 요약 ── */
    const stage = url.searchParams.get('stage');
    const assigneeId = Number(url.searchParams.get('assignee_id')) || 0;
    const q = (url.searchParams.get('q') || '').trim();
    const where = ['deleted_at IS NULL'];
    const binds = [];
    if (stage && STAGES.includes(stage)) { where.push('stage = ?'); binds.push(stage); }
    if (assigneeId) { where.push('assignee_user_id = ?'); binds.push(assigneeId); }
    if (q) { where.push('(name LIKE ? OR company LIKE ? OR phone LIKE ?)'); binds.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
    const { results } = await db.prepare(
      `SELECT id, name, company, phone, lead_type, source, stage, assignee_user_id, assignee_name,
              next_action, next_action_date, lost_reason, created_at, updated_at, won_at,
              ref_owner_type, ref_owner_id
       FROM sales_leads WHERE ${where.join(' AND ')}
       ORDER BY CASE
           WHEN next_action_date IS NOT NULL AND next_action_date < '${today}' AND stage IN ('lead','contacted','consulting','proposal') THEN 0
           WHEN next_action_date = '${today}' THEN 1 ELSE 2 END,
         next_action_date ASC, updated_at DESC
       LIMIT 500`
    ).bind(...binds).all();
    const leads = results || [];

    /* 요약 (필터 무관 전체 기준) */
    const sum = { today: 0, overdue: 0, noAction: 0, active: 0, wonMonth: 0, stages: {} };
    try {
      const { results: allRows } = await db.prepare(
        `SELECT stage, next_action_date, won_at FROM sales_leads WHERE deleted_at IS NULL`
      ).all();
      const month = today.substring(0, 7);
      for (const r of (allRows || [])) {
        sum.stages[r.stage] = (sum.stages[r.stage] || 0) + 1;
        if (ACTIVE_STAGES.includes(r.stage)) {
          sum.active++;
          if (!r.next_action_date) sum.noAction++;
          else if (r.next_action_date < today && r.stage !== 'hold') sum.overdue++;
          else if (r.next_action_date === today) sum.today++;
        }
        if (r.stage === 'won' && String(r.won_at || '').substring(0, 7) === month) sum.wonMonth++;
      }
    } catch (_) {}
    return Response.json({ ok: true, today, leads, summary: sum });
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
  await ensureTables(db);

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const actor = await actorName(db, auth);
  const now = kst();

  try {
    /* ── 활동 기록 + 단계 자동 이동 ── */
    if (action === 'log') {
      const leadId = Number(body.lead_id);
      if (!leadId) return Response.json({ error: 'lead_id required' }, { status: 400 });
      const lead = await db.prepare(`SELECT * FROM sales_leads WHERE id = ? AND deleted_at IS NULL`).bind(leadId).first();
      if (!lead) return Response.json({ error: '리드를 찾을 수 없습니다' }, { status: 404 });

      const result = RESULTS.includes(body.result) ? body.result : 'note';
      const content = String(body.content || '').trim().slice(0, 2000);
      if (!content && result === 'note') return Response.json({ error: '내용을 입력해주세요' }, { status: 400 });

      /* 단계 결정 */
      let newStage = lead.stage;
      const mapped = RESULT_STAGE[result];
      if (mapped) {
        /* called 은 승격만 (상담중인 리드를 통화했다고 contacted 로 되돌리지 않음) */
        if (result === 'called') {
          if (lead.stage === 'lead' || lead.stage === 'hold') newStage = 'contacted';
        } else {
          newStage = mapped;
        }
      } else if (lead.stage === 'hold' && ONGOING.includes(result)) {
        newStage = 'contacted'; /* 보류에서 활동 재개 → 연락함으로 부활 */
      }

      /* 다음 액션 규칙 */
      let nextAction = lead.next_action, nextDate = lead.next_action_date, lostReason = lead.lost_reason, wonAt = lead.won_at;
      if (result === 'won') {
        nextAction = null; nextDate = null; wonAt = now;
      } else if (result === 'lost') {
        nextAction = null; nextDate = null;
        lostReason = String(body.lost_reason || content || '').slice(0, 300);
      } else if (result === 'hold') {
        const hu = body.hold_until || body.next_action_date;
        if (!validDate(hu)) return Response.json({ error: '보류는 재접촉일(hold_until)이 필요합니다' }, { status: 400 });
        nextAction = String(body.next_action || '재접촉').slice(0, 200);
        nextDate = hu;
      } else {
        /* 진행형: 다음 액션 필수 */
        if (!validDate(body.next_action_date)) return Response.json({ error: '다음 액션 날짜가 필요합니다 (리드가 잊히지 않게)' }, { status: 400 });
        nextAction = String(body.next_action || '').trim().slice(0, 200) || '팔로업';
        nextDate = body.next_action_date;
      }

      await db.prepare(
        `INSERT INTO sales_lead_logs (lead_id, kind, content, result, stage_after, actor_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(leadId, body.kind && ['call','meet','send','note'].includes(body.kind) ? body.kind : 'note',
             content, result, newStage, actor, now).run();
      await db.prepare(
        `UPDATE sales_leads SET stage = ?, next_action = ?, next_action_date = ?, lost_reason = ?, won_at = ?, updated_at = ? WHERE id = ?`
      ).bind(newStage, nextAction, nextDate, lostReason, wonAt, now, leadId).run();

      if (result === 'won' || result === 'lost') {
        logAudit(db, { actor, action: 'sales_lead_' + result, entity_type: 'sales_lead', entity_id: leadId, before: lead.stage, after: newStage, request: context.request });
      }
      return Response.json({ ok: true, stage: newStage, next_action_date: nextDate });
    }

    /* ── 리드 생성 ── */
    const name = String(body.name || '').trim().slice(0, 100);
    if (!name) return Response.json({ error: '이름을 입력해주세요' }, { status: 400 });
    if (!validDate(body.next_action_date)) return Response.json({ error: '첫 연락 날짜가 필요합니다 (리드가 잊히지 않게)' }, { status: 400 });

    const refType = ['User', 'Business'].includes(body.ref_owner_type) ? body.ref_owner_type : null;
    const refId = refType ? (Number(body.ref_owner_id) || null) : null;
    /* 같은 사람/업체 진행중 리드 중복 방지 */
    if (refType && refId) {
      const dup = await db.prepare(
        `SELECT id FROM sales_leads WHERE ref_owner_type = ? AND ref_owner_id = ? AND deleted_at IS NULL
           AND stage IN (${ACTIVE_STAGES.map(() => '?').join(',')}) LIMIT 1`
      ).bind(refType, refId, ...ACTIVE_STAGES).first();
      if (dup) return Response.json({ ok: true, id: dup.id, existed: true });
    }

    let assigneeName = null;
    const assigneeId = Number(body.assignee_user_id) || null;
    if (assigneeId) {
      try {
        const u = await db.prepare(`SELECT COALESCE(real_name, name) AS n FROM users WHERE id = ?`).bind(assigneeId).first();
        assigneeName = u ? u.n : null;
      } catch (_) {}
    }

    const r = await db.prepare(
      `INSERT INTO sales_leads (name, company, phone, lead_type, source, ref_owner_type, ref_owner_id,
         stage, assignee_user_id, assignee_name, next_action, next_action_date, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      name,
      String(body.company || '').slice(0, 100) || null,
      String(body.phone || '').slice(0, 30) || null,
      LEAD_TYPES.includes(body.lead_type) ? body.lead_type : 'other',
      SOURCES.includes(body.source) ? body.source : 'manual',
      refType, refId,
      assigneeId, assigneeName,
      String(body.next_action || '첫 연락').slice(0, 200),
      body.next_action_date,
      String(body.note || '').slice(0, 1000) || null,
      now, now
    ).run();
    const id = r?.meta?.last_row_id;
    await db.prepare(
      `INSERT INTO sales_lead_logs (lead_id, kind, content, result, stage_after, actor_name, created_at)
       VALUES (?, 'note', ?, 'note', 'lead', ?, ?)`
    ).bind(id, '리드 등록' + (body.note ? ' — ' + String(body.note).slice(0, 200) : ''), actor, now).run();
    logAudit(db, { actor, action: 'sales_lead_create', entity_type: 'sales_lead', entity_id: id, after: name, request: context.request });
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTables(db);

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const id = Number(body.id);
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  try {
    const lead = await db.prepare(`SELECT * FROM sales_leads WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
    if (!lead) return Response.json({ error: '리드를 찾을 수 없습니다' }, { status: 404 });

    const updates = [], binds = [];
    if (body.stage !== undefined && STAGES.includes(body.stage)) { updates.push('stage = ?'); binds.push(body.stage); }
    if (body.name !== undefined) { const v = String(body.name).trim().slice(0, 100); if (v) { updates.push('name = ?'); binds.push(v); } }
    if (body.company !== undefined) { updates.push('company = ?'); binds.push(String(body.company || '').slice(0, 100) || null); }
    if (body.phone !== undefined) { updates.push('phone = ?'); binds.push(String(body.phone || '').slice(0, 30) || null); }
    if (body.lead_type !== undefined && LEAD_TYPES.includes(body.lead_type)) { updates.push('lead_type = ?'); binds.push(body.lead_type); }
    if (body.next_action !== undefined) { updates.push('next_action = ?'); binds.push(String(body.next_action || '').slice(0, 200) || null); }
    if (body.next_action_date !== undefined) {
      if (body.next_action_date && !validDate(body.next_action_date)) return Response.json({ error: 'invalid date' }, { status: 400 });
      updates.push('next_action_date = ?'); binds.push(body.next_action_date || null);
    }
    if (body.note !== undefined) { updates.push('note = ?'); binds.push(String(body.note || '').slice(0, 1000) || null); }
    if (body.assignee_user_id !== undefined) {
      const aid = Number(body.assignee_user_id) || null;
      let an = null;
      if (aid) {
        try { const u = await db.prepare(`SELECT COALESCE(real_name, name) AS n FROM users WHERE id = ?`).bind(aid).first(); an = u ? u.n : null; } catch (_) {}
      }
      updates.push('assignee_user_id = ?'); binds.push(aid);
      updates.push('assignee_name = ?'); binds.push(an);
    }
    if (!updates.length) return Response.json({ error: 'no fields' }, { status: 400 });
    updates.push('updated_at = ?'); binds.push(kst());
    binds.push(id);
    await db.prepare(`UPDATE sales_leads SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

    /* 수동 단계 변경은 타임라인에 흔적 */
    if (body.stage !== undefined && body.stage !== lead.stage) {
      const actor = await actorName(db, auth);
      await db.prepare(
        `INSERT INTO sales_lead_logs (lead_id, kind, content, result, stage_after, actor_name, created_at)
         VALUES (?, 'stage', ?, NULL, ?, ?, ?)`
      ).bind(id, '단계 수동 변경: ' + lead.stage + ' → ' + body.stage, body.stage, actor, kst()).run();
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  if (!hasAdminRole(auth, 'admin')) return roleForbidden('admin');
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  try {
    const lead = await db.prepare(`SELECT id, name FROM sales_leads WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
    if (!lead) return Response.json({ error: 'not found' }, { status: 404 });
    await db.prepare(`UPDATE sales_leads SET deleted_at = ? WHERE id = ?`).bind(kst(), id).run();
    const actor = await actorName(db, auth);
    logAudit(db, { actor, action: 'sales_lead_delete', entity_type: 'sales_lead', entity_id: id, before: lead.name, request: context.request });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
