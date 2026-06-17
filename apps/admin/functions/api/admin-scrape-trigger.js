// 신고서 스크래핑 — enqueue 엔드포인트 (Phase 2, 2026-06-17)
//
// 직원(editor+)이 거래처 신고서 조회를 큐에 적재. 동기 호출 안 함 — 실제 조회는
// cron-scrape-worker 가 비동기 배치로 수행 (간편인증 2-way 대기·신고철 지연 대응).
//
// Endpoints (POST only):
// - POST /api/admin-scrape-trigger?action=create_connection
//     body: { user_id, business_id?, provider?, consent_source? }
//     → scrape_connections 1건 생성 (직원이 거래처 동의를 대리 기록). 인증정보는 저장 안 함.
// - POST /api/admin-scrape-trigger
//     body: { connection_id, filing_type, fiscal_year, period_label? }
//     → 동의 확인 후 scrape_jobs 큐에 적재.

import { checkAdmin, adminUnauthorized, checkOriginCsrf, hasAdminRole, roleForbidden } from "./_adminAuth.js";
import { ensureScrapeTables, kst } from "./_scrape.js";

const FILING_TYPES = ['종소세', '법인세', '부가세'];

export async function onRequestPost(context) {
  const csrf = checkOriginCsrf(context.request, context.env);
  if (csrf) return csrf;

  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!hasAdminRole(auth, 'editor')) return roleForbidden('editor');

  const db = context.env.DB;
  if (!db) return Response.json({ error: "no_db" }, { status: 500 });
  await ensureScrapeTables(db);

  let body;
  try { body = await context.request.json(); } catch { body = {}; }

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';
  const actor = auth.userId ? `user:${auth.userId}` : 'owner';

  /* ── 연결 생성 (동의 대리 기록) ── */
  if (action === 'create_connection') {
    const userId = Number(body.user_id || 0);
    if (!userId) return Response.json({ error: 'user_id required' }, { status: 400 });
    const provider = String(body.provider || context.env.SCRAPE_PROVIDER || 'mock').toLowerCase();
    const businessId = body.business_id ? Number(body.business_id) : null;
    const consentRecord = JSON.stringify({
      recorded_by: actor,
      source: body.consent_source || 'staff_on_behalf',
      at: kst(),
      ip: context.request.headers.get('CF-Connecting-IP') || null,
    });
    const now = kst();
    const res = await db.prepare(
      `INSERT INTO scrape_connections
        (business_id, user_id, provider, consent_status, consent_at, consent_source, consent_record, status, created_at, updated_at)
       VALUES (?, ?, ?, 'granted', ?, ?, ?, 'active', ?, ?)`
    ).bind(businessId, userId, provider, now, body.consent_source || 'staff_on_behalf', consentRecord, now, now).run();
    const connectionId = res.meta?.last_row_id;
    await logScrapeAudit(db, context, { actor, action: 'scrape_connection_create', entity_id: connectionId, after: { user_id: userId, provider } });
    return Response.json({ ok: true, connection_id: connectionId });
  }

  /* ── 조회 작업 enqueue ── */
  const connectionId = Number(body.connection_id || 0);
  const filingType = String(body.filing_type || '');
  const fiscalYear = Number(body.fiscal_year || 0);
  const periodLabel = body.period_label ? String(body.period_label) : null;

  if (!connectionId) return Response.json({ error: 'connection_id required' }, { status: 400 });
  if (!FILING_TYPES.includes(filingType)) return Response.json({ error: 'invalid filing_type' }, { status: 400 });
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return Response.json({ error: 'invalid fiscal_year' }, { status: 400 });
  }

  const conn = await db.prepare(`SELECT * FROM scrape_connections WHERE id = ?`).bind(connectionId).first();
  if (!conn) return Response.json({ error: 'connection not found' }, { status: 404 });
  if (conn.consent_status !== 'granted' || conn.status !== 'active') {
    return Response.json({ error: 'consent not granted / connection disabled' }, { status: 403 });
  }

  const now = kst();
  const res = await db.prepare(
    `INSERT INTO scrape_jobs
       (connection_id, user_id, filing_type, fiscal_year, period_label, status, requested_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)`
  ).bind(connectionId, conn.user_id, filingType, fiscalYear, periodLabel, actor, now, now).run();
  const jobId = res.meta?.last_row_id;

  await logScrapeAudit(db, context, {
    actor, action: 'scrape_enqueue', entity_id: jobId,
    after: { connection_id: connectionId, user_id: conn.user_id, filing_type: filingType, fiscal_year: fiscalYear },
  });

  return Response.json({ ok: true, job_id: jobId });
}

/* audit_log 가 있으면 기록 (없어도 무중단) */
async function logScrapeAudit(db, context, { actor, action, entity_id, after }) {
  try {
    const { logAudit } = await import('./_audit.js');
    await logAudit(db, { actor, action, entity_type: 'scrape', entity_id, after, request: context.request });
  } catch {}
}
