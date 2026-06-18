// 신고서 스크래핑 — 무인 자동 스케줄러 (Phase 무인자동, 2026-06-18)
//
// 매월(외부 cron) 활성·수임동의된 거래처 전체에 대해 scrape_jobs 를 자동 적재.
// 실제 조회는 cron-scrape-worker 가 별도로 드레인 → 검증 큐 → 승인 시 챗봇 노출.
// "무인 자동 연속" 정책: 사람이 ② 스크래핑 요청을 누르지 않아도 매월 자동으로 채움.
//
// 호출 (cron-alerts.js 패턴):
//   외부 스케줄러 → POST /api/cron-scrape-schedule?key=CRON_KEY  (예: 매월 1일)
//   옵션: ?year=2025 (기본: 작년) · ?types=부가세,종소세,법인세 (기본 3종) · ?dry_run=1
//
// 멱등성: 같은 (connection, 세목, 귀속연도) 에 이미 queued/running/success job 이 있으면 skip
//   → 매월 돌려도 중복 폭주 없음. failed 건은 다시 적재(재시도 기회).

import { ensureScrapeTables, kst } from "./_scrape.js";

const DEFAULT_TYPES = ['부가세', '종소세', '법인세'];

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

  const url = new URL(context.request.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const year = Number(url.searchParams.get('year')) || (new Date().getUTCFullYear() - 1);
  const typesParam = url.searchParams.get('types');
  const types = typesParam
    ? typesParam.split(',').map((t) => t.trim()).filter((t) => DEFAULT_TYPES.includes(t))
    : DEFAULT_TYPES;

  /* 활성 + 수임동의 거래처 */
  const { results: conns } = await db.prepare(
    `SELECT id, user_id, provider FROM scrape_connections
     WHERE consent_status = 'granted' AND status = 'active'`
  ).all();

  let enqueued = 0, skipped = 0;
  const now = kst();

  for (const c of (conns || [])) {
    for (const type of types) {
      try {
        const dup = await db.prepare(
          `SELECT 1 FROM scrape_jobs
           WHERE connection_id = ? AND filing_type = ? AND fiscal_year = ?
             AND status IN ('queued','running','success') LIMIT 1`
        ).bind(c.id, type, year).first();
        if (dup) { skipped++; continue; }
        if (dryRun) { enqueued++; continue; }
        await db.prepare(
          `INSERT INTO scrape_jobs
             (connection_id, user_id, filing_type, fiscal_year, status, requested_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'queued', 'auto_schedule', ?, ?)`
        ).bind(c.id, c.user_id, type, year, now, now).run();
        enqueued++;
      } catch {
        /* 한 건 실패가 전체 중단 안 시킴 */
      }
    }
  }

  return Response.json({
    ok: true, dry_run: dryRun, year, types,
    connections: (conns || []).length, enqueued, skipped,
  });
}
