// 신고서 스크래핑 — 비동기 워커 (Phase 2, 2026-06-17)
//
// scrape_jobs 큐의 'queued' 작업을 배치로 처리. 제공사 어댑터로 조회 → scraped_filings_raw 저장.
// filings 에는 직접 안 씀 — 검증(admin-scrape-review approve)을 거쳐야 챗봇에 노출됨.
//
// 호출 방법 (택 1, cron-alerts.js 와 동일 패턴):
//   1) 외부 cron 서비스(cron-job.org 무료) → POST /api/cron-scrape-worker?key=CRON_KEY (예: 5분 간격)
//   2) 관리자 수동 실행
//   ※ Cloudflare Queues 는 바인딩 필요 → D1 큐로 대체. wrangler 손대지 않음.
//
// 매 호출 시:
//   - stale-lock 복구: 'running' 인데 15분 이상 잠긴 작업 재큐 (워커 크래시/타임아웃 안전)
//   - 'queued' 소량(LIMIT) 클레임(낙관적 락) → 어댑터 조회 → 성공/실패 처리
//   - 실패: retryable && attempts<max → 백오프 후 재큐, 아니면 'failed'

import { ensureScrapeTables, kst, backoffMinutes, getScrapeAdapter } from "./_scrape.js";
import { rateLimit } from "./_ratelimit.js";

const BATCH = 5;          // 스크래핑은 느림/요율 제한 → 소량
const STALE_MIN = 15;     // running 잠금 만료(분)

async function authorized(context) {
  const adminKey = context.env.ADMIN_KEY;
  const cronKey = context.env.CRON_KEY || context.env.ADMIN_KEY;
  const key = new URL(context.request.url).searchParams.get('key');
  if (adminKey && key === adminKey) return true;
  if (cronKey && key === cronKey) return true;
  return false;
}

export async function onRequestGet(context) { return run(context); }
export async function onRequestPost(context) { return run(context); }

async function run(context) {
  if (!await authorized(context)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  await ensureScrapeTables(db);

  const adapter = getScrapeAdapter(context.env);
  const provider = adapter.name;
  const now = kst();

  /* 1) stale-lock 복구 */
  try {
    await db.prepare(
      `UPDATE scrape_jobs SET status = 'queued', locked_at = NULL, updated_at = ?
       WHERE status = 'running' AND locked_at IS NOT NULL
         AND locked_at < datetime('now', '+9 hours', '-${STALE_MIN} minutes')`
    ).bind(now).run();
  } catch {}

  /* 2) 처리 대상 후보 (queued, 백오프 도달) */
  const { results: candidates } = await db.prepare(
    `SELECT * FROM scrape_jobs
     WHERE status = 'queued' AND (next_run_at IS NULL OR next_run_at <= ?)
     ORDER BY id ASC LIMIT ?`
  ).bind(now, BATCH).all();

  let claimed = 0, success = 0, failed = 0, requeued = 0, throttled = 0;
  const results = [];

  for (const job of (candidates || [])) {
    /* 낙관적 락 — status='queued' 조건부 UPDATE. 0행이면 다른 워커가 가져감 → skip */
    let lockRes;
    try {
      lockRes = await db.prepare(
        `UPDATE scrape_jobs SET status = 'running', locked_at = ?, updated_at = ?
         WHERE id = ? AND status = 'queued'`
      ).bind(now, now, job.id).run();
    } catch (e) {
      results.push({ id: job.id, ok: false, error: 'lock_failed' });
      continue;
    }
    if (!lockRes.meta || lockRes.meta.changes === 0) continue; // 이미 클레임됨
    claimed++;

    try {
      /* 제공사 요율 보호 (페이드 API + 국세청 throttle 회피) */
      const rl = await rateLimit(db, `scrape:${provider}`, 30, 60);
      if (!rl.ok) {
        await db.prepare(
          `UPDATE scrape_jobs SET status = 'queued', locked_at = NULL,
             next_run_at = datetime('now', '+9 hours', '+1 minutes'), updated_at = ?
           WHERE id = ?`
        ).bind(kst(), job.id).run();
        throttled++; requeued++;
        results.push({ id: job.id, ok: false, throttled: true });
        continue;
      }

      const conn = await db.prepare(`SELECT * FROM scrape_connections WHERE id = ?`).bind(job.connection_id).first();
      if (!conn || conn.consent_status !== 'granted' || conn.status !== 'active') {
        await failJob(db, job, 'consent_revoked_or_missing');
        failed++; results.push({ id: job.id, ok: false, error: 'consent' });
        continue;
      }

      const out = await adapter.fetchFilings(conn.connection_ref || `mock-${conn.id}`, {
        type: job.filing_type, fiscalYear: job.fiscal_year, periodLabel: job.period_label || undefined,
      });

      if (out.ok) {
        const rawRes = await db.prepare(
          `INSERT INTO scraped_filings_raw
             (job_id, connection_id, user_id, provider, filing_type, fiscal_year, period_label, raw_payload, normalized, fetched_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          job.id, job.connection_id, job.user_id, provider, job.filing_type, job.fiscal_year, job.period_label || null,
          JSON.stringify(out.rawPayload ?? null), JSON.stringify(out.normalized ?? null), out.fetchedAt || kst(), kst(),
        ).run();
        const rawId = rawRes.meta?.last_row_id;
        await db.prepare(
          `UPDATE scrape_jobs SET status = 'success', raw_id = ?, locked_at = NULL, last_error = NULL, updated_at = ? WHERE id = ?`
        ).bind(rawId, kst(), job.id).run();
        await db.prepare(`UPDATE scrape_connections SET last_synced_at = ?, updated_at = ? WHERE id = ?`)
          .bind(kst(), kst(), job.connection_id).run();
        success++; results.push({ id: job.id, ok: true, raw_id: rawId });
      } else {
        const attempts = Number(job.attempts || 0) + 1;
        const retryable = !!(out.error && out.error.retryable);
        const errMsg = (out.error && out.error.message) || 'unknown';
        if (retryable && attempts < Number(job.max_attempts || 3)) {
          await db.prepare(
            `UPDATE scrape_jobs SET status = 'queued', attempts = ?, locked_at = NULL, last_error = ?,
               next_run_at = datetime('now', '+9 hours', '+${backoffMinutes(attempts)} minutes'), updated_at = ?
             WHERE id = ?`
          ).bind(attempts, errMsg, kst(), job.id).run();
          requeued++; results.push({ id: job.id, ok: false, requeued: true, attempts });
        } else {
          await failJob(db, job, errMsg, attempts);
          failed++; results.push({ id: job.id, ok: false, error: errMsg });
        }
      }
    } catch (e) {
      await failJob(db, job, e.message);
      failed++; results.push({ id: job.id, ok: false, error: e.message });
    }
  }

  return Response.json({ provider, claimed, success, failed, requeued, throttled, results });
}

async function failJob(db, job, errMsg, attempts) {
  try {
    await db.prepare(
      `UPDATE scrape_jobs SET status = 'failed', attempts = ?, locked_at = NULL, last_error = ?, updated_at = ? WHERE id = ?`
    ).bind(attempts != null ? attempts : Number(job.attempts || 0) + 1, String(errMsg).slice(0, 500), kst(), job.id).run();
  } catch {}
}
