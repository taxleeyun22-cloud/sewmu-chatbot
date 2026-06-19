// 신고서 스크래핑 — 검증 큐 + reconcile (Phase 3, 2026-06-17)
//
// 직원이 스크래핑 원본을 검토 후 승인하면, 정규화 데이터가 filings 에 reconcile 되고
// verified_at 이 찍혀 비로소 챗봇에 노출된다. (미검증 수치는 챗봇 비노출 — chat.js WHERE 필터)
//
// Endpoints:
// - GET  /api/admin-scrape-review                  → 검증 대기/이력 목록 (jobs ⨝ raw)
// - GET  /api/admin-scrape-review?raw_id=N         → 원본 상세 1건
// - POST /api/admin-scrape-review?action=approve&raw_id=N  → reconcile → filings upsert + 검증
//        body: { force? }  // 수동 검토표와 충돌 시 덮어쓰기 허용
// - POST /api/admin-scrape-review?action=reject&raw_id=N   → 반려 (filings 안 씀)

import { checkAdmin, adminUnauthorized, checkOriginCsrf, hasAdminRole, roleForbidden } from "./_adminAuth.js";
import { ensureScrapeTables, normalizeToAutoFields, kst } from "./_scrape.js";

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "no_db" }, { status: 500 });
  await ensureScrapeTables(db);

  const url = new URL(context.request.url);
  const rawId = Number(url.searchParams.get('raw_id') || 0);

  if (rawId) {
    const raw = await db.prepare(`SELECT * FROM scraped_filings_raw WHERE id = ?`).bind(rawId).first();
    if (!raw) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json({ ok: true, raw });
  }

  const status = url.searchParams.get('status'); // 선택: job status 필터
  const userId = Number(url.searchParams.get('user_id') || 0);
  const where = [];
  const binds = [];
  if (status) { where.push('j.status = ?'); binds.push(status); }
  if (userId) { where.push('j.user_id = ?'); binds.push(userId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { results } = await db.prepare(
    `SELECT j.id AS job_id, j.status, j.filing_type, j.fiscal_year, j.period_label, j.user_id,
            j.attempts, j.last_error, j.raw_id, j.updated_at,
            r.id AS raw_pk, r.normalized, r.provider, r.fetched_at
     FROM scrape_jobs j
     LEFT JOIN scraped_filings_raw r ON j.raw_id = r.id
     ${whereSql}
     ORDER BY j.id DESC LIMIT 200`
  ).bind(...binds).all();

  return Response.json({ ok: true, jobs: results || [] });
}

export async function onRequestPost(context) {
  const csrf = checkOriginCsrf(context.request, context.env);
  if (csrf) return csrf;

  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!hasAdminRole(auth, 'editor')) return roleForbidden('editor');

  const db = context.env.DB;
  if (!db) return Response.json({ error: "no_db" }, { status: 500 });
  await ensureScrapeTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';
  const rawId = Number(url.searchParams.get('raw_id') || 0);
  if (!rawId) return Response.json({ error: 'raw_id required' }, { status: 400 });

  let body;
  try { body = await context.request.json(); } catch { body = {}; }
  const actor = auth.userId ? `user:${auth.userId}` : 'owner';

  const raw = await db.prepare(`SELECT * FROM scraped_filings_raw WHERE id = ?`).bind(rawId).first();
  if (!raw) return Response.json({ error: 'raw not found' }, { status: 404 });

  if (action === 'reject') {
    if (raw.job_id) {
      await db.prepare(`UPDATE scrape_jobs SET status = 'failed', last_error = '직원 반려', updated_at = ? WHERE id = ?`)
        .bind(kst(), raw.job_id).run();
    }
    await logScrapeAudit(db, context, { actor, action: 'scrape_reject', entity_id: rawId });
    return Response.json({ ok: true, rejected: true });
  }

  if (action !== 'approve') return Response.json({ error: 'invalid action' }, { status: 400 });

  /* ── reconcile: 정규화 → auto_fields → filings upsert (owner_type='Person', 검증 표시) ── */
  let normalized = null;
  try { normalized = JSON.parse(raw.normalized || 'null'); } catch {}
  const autoFields = JSON.stringify(normalizeToAutoFields(normalized, raw.filing_type));
  const now = kst();
  const ownerType = 'Person';      // 챗봇이 읽는 스코프 (거래처 본인)
  const ownerId = Number(raw.user_id);

  /* 같은 (type, fiscal_year, owner) 기존 행 확인 */
  const existing = await db.prepare(
    `SELECT id, source FROM filings
     WHERE type = ? AND fiscal_year = ? AND owner_type = ? AND owner_id = ?
       AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`
  ).bind(raw.filing_type, raw.fiscal_year, ownerType, ownerId).first();

  if (existing) {
    /* 수동 검토표를 스크래핑이 덮어쓰지 않음 — force 없으면 충돌 반환 (직원 선택) */
    if (existing.source === 'manual' || existing.source == null) {
      if (!body.force) {
        return Response.json({
          error: 'conflict_manual_filing',
          message: `수동 검토표(id #${existing.id})가 이미 있습니다. 덮어쓰려면 force=true.`,
          existing_id: existing.id,
        }, { status: 409 });
      }
    }
    await db.prepare(
      `UPDATE filings SET auto_fields = ?, source = 'scraped', scrape_raw_id = ?, scrape_job_id = ?,
         scraped_at = ?, verified_at = ?, verified_by = ?, updated_at = ?
       WHERE id = ?`
    ).bind(autoFields, rawId, raw.job_id || null, raw.fetched_at || now, now, auth.userId || null, now, existing.id).run();
    await logScrapeAudit(db, context, { actor, action: 'scrape_approve_update', entity_id: existing.id, after: { raw_id: rawId } });
    return Response.json({ ok: true, filing_id: existing.id, updated: true });
  }

  const res = await db.prepare(
    `INSERT INTO filings
       (type, fiscal_year, owner_type, owner_id, auto_fields, review_status, author_user_id,
        source, scrape_raw_id, scrape_job_id, scraped_at, verified_at, verified_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '보관완료', ?, 'scraped', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    raw.filing_type, raw.fiscal_year, ownerType, ownerId, autoFields, auth.userId || null,
    rawId, raw.job_id || null, raw.fetched_at || now, now, auth.userId || null, now, now,
  ).run();
  const filingId = res.meta?.last_row_id;
  await logScrapeAudit(db, context, { actor, action: 'scrape_approve_create', entity_id: filingId, after: { raw_id: rawId, user_id: ownerId } });
  return Response.json({ ok: true, filing_id: filingId, created: true });
}

async function logScrapeAudit(db, context, { actor, action, entity_id, after }) {
  try {
    const { logAudit } = await import('./_audit.js');
    await logAudit(db, { actor, action, entity_type: 'scrape', entity_id, after, request: context.request });
  } catch {}
}
