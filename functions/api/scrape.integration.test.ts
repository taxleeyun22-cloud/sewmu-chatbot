/**
 * Phase 신고서스크래핑-7 (2026-06-17): 스크래핑 파이프라인 통합 테스트.
 *
 * enqueue → worker(클레임/조회) → raw 저장 → approve(reconcile + 검증) → 챗봇 노출
 * + 동의 게이트 / IDOR / 반려 / 미검증 제외 / 재시도·종료 오류.
 *
 * 엔드포인트(functions/api JS)를 fake context 로 직접 호출. DB = createTestDb() 의 D1 호환 d1.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error JS module
import { onRequestPost as triggerPost } from './admin-scrape-trigger.js';
// @ts-expect-error JS module
import { onRequestGet as workerGet } from './cron-scrape-worker.js';
// @ts-expect-error JS module
import { onRequestGet as reviewGet, onRequestPost as reviewPost } from './admin-scrape-review.js';
// @ts-expect-error JS module
import { ensureScrapeTables } from './_scrape.js';

const KEY = 'test-admin-key';

type AnyDb = ReturnType<typeof createTestDb>['d1'];

function ctx(d1: AnyDb, opts: { method?: string; search?: string; body?: unknown } = {}) {
  const method = opts.method ?? 'POST';
  const url = `https://sewmu-admin.pages.dev/api/scrape${opts.search ?? ''}`;
  const headers = new Headers();
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  const request = new Request(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { env: { DB: d1, ADMIN_KEY: KEY, CRON_KEY: KEY, SCRAPE_PROVIDER: 'mock' }, request };
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, any>>;
}

/** chat.js getClientFilings 의 WHERE 절을 그대로 반영 (미검증 스크래핑 제외 contract lock). */
async function chatbotFilings(d1: AnyDb, userId: number) {
  const { results } = await d1
    .prepare(
      `SELECT type, fiscal_year, auto_fields, source FROM filings
       WHERE owner_type = 'Person' AND owner_id = ? AND (deleted_at IS NULL OR deleted_at = '')
         AND (source = 'manual' OR source IS NULL OR verified_at IS NOT NULL)
       ORDER BY fiscal_year DESC LIMIT 5`,
    )
    .bind(userId)
    .all();
  return results;
}

async function createConnection(d1: AnyDb, userId: number) {
  const res = await triggerPost(ctx(d1, { search: `?action=create_connection&key=${KEY}`, body: { user_id: userId } }));
  const j = await json(res);
  return j.connection_id as number;
}

async function enqueue(d1: AnyDb, connectionId: number, fiscalYear = 2024, filingType = '부가세') {
  const res = await triggerPost(
    ctx(d1, { search: `?key=${KEY}`, body: { connection_id: connectionId, filing_type: filingType, fiscal_year: fiscalYear } }),
  );
  return { status: res.status, body: await json(res) };
}

async function runWorker(d1: AnyDb) {
  const res = await workerGet(ctx(d1, { method: 'GET', search: `?key=${KEY}` }));
  return json(res);
}

describe('scrape pipeline integration', () => {
  let d1: AnyDb;
  beforeEach(async () => {
    d1 = createTestDb().d1;
    await ensureScrapeTables(d1);
  });

  it('full happy path: enqueue → worker → approve → chatbot sees verified scraped filing', async () => {
    const conn = await createConnection(d1, 100);
    const eq = await enqueue(d1, conn, 2024);
    expect(eq.status).toBe(200);
    const jobId = eq.body.job_id;
    expect(jobId).toBeTruthy();

    const w = await runWorker(d1);
    expect(w.claimed).toBe(1);
    expect(w.success).toBe(1);

    // worker 는 filings 에 안 씀 → 검증 전 챗봇 비노출
    expect(await chatbotFilings(d1, 100)).toHaveLength(0);

    const job = await d1.prepare(`SELECT raw_id FROM scrape_jobs WHERE id = ?`).bind(jobId).first();
    const rawId = job.raw_id;
    expect(rawId).toBeTruthy();

    const appr = await reviewPost(ctx(d1, { search: `?action=approve&raw_id=${rawId}&key=${KEY}`, body: {} }));
    const aj = await json(appr);
    expect(appr.status).toBe(200);
    expect(aj.ok).toBe(true);

    const filing = await d1.prepare(`SELECT * FROM filings WHERE id = ?`).bind(aj.filing_id).first();
    expect(filing.source).toBe('scraped');
    expect(filing.verified_at).toBeTruthy();
    expect(filing.owner_id).toBe(100);
    const af = JSON.parse(filing.auto_fields);
    expect(af.revenue).toBeGreaterThan(0);

    // 검증 후 챗봇 노출
    const visible = await chatbotFilings(d1, 100);
    expect(visible).toHaveLength(1);
    expect(visible[0].source).toBe('scraped');
  });

  it('unverified scraped filing is EXCLUDED, verified is INCLUDED (safety contract)', async () => {
    // 직접 삽입: 미검증 스크래핑 행 + 검증된 스크래핑 행
    await d1.prepare(
      `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, auto_fields, source, verified_at, created_at)
       VALUES ('부가세', 2023, 'Person', 100, '{"revenue":5}', 'scraped', NULL, '2026-01-01')`,
    ).run();
    await d1.prepare(
      `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, auto_fields, source, verified_at, created_at)
       VALUES ('부가세', 2024, 'Person', 100, '{"revenue":9}', 'scraped', '2026-06-17', '2026-01-01')`,
    ).run();
    // 수동(legacy NULL source) 행도 노출돼야 함
    await d1.prepare(
      `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, auto_fields, source, verified_at, created_at)
       VALUES ('종소세', 2022, 'Person', 100, '{"revenue":7}', NULL, NULL, '2026-01-01')`,
    ).run();

    const visible = await chatbotFilings(d1, 100);
    const years = visible.map((r: any) => r.fiscal_year).sort();
    expect(years).toEqual([2022, 2024]); // 2023(미검증 스크래핑) 제외
  });

  it('consent gate: revoked connection cannot enqueue', async () => {
    const conn = await createConnection(d1, 100);
    await d1.prepare(`UPDATE scrape_connections SET consent_status = 'revoked' WHERE id = ?`).bind(conn).run();
    const eq = await enqueue(d1, conn);
    expect(eq.status).toBe(403);
  });

  it('IDOR: user A scraped filing not visible to user B', async () => {
    const conn = await createConnection(d1, 100);
    const eq = await enqueue(d1, conn);
    await runWorker(d1);
    const job = await d1.prepare(`SELECT raw_id FROM scrape_jobs WHERE id = ?`).bind(eq.body.job_id).first();
    await reviewPost(ctx(d1, { search: `?action=approve&raw_id=${job.raw_id}&key=${KEY}`, body: {} }));

    expect(await chatbotFilings(d1, 100)).toHaveLength(1);
    expect(await chatbotFilings(d1, 200)).toHaveLength(0); // 다른 거래처엔 안 보임
  });

  it('reject does not write filings', async () => {
    const conn = await createConnection(d1, 100);
    const eq = await enqueue(d1, conn);
    await runWorker(d1);
    const job = await d1.prepare(`SELECT raw_id FROM scrape_jobs WHERE id = ?`).bind(eq.body.job_id).first();
    const rej = await reviewPost(ctx(d1, { search: `?action=reject&raw_id=${job.raw_id}&key=${KEY}`, body: {} }));
    expect((await json(rej)).rejected).toBe(true);
    expect(await chatbotFilings(d1, 100)).toHaveLength(0);
  });

  it('approve refuses to overwrite a manual filing without force, allows with force', async () => {
    // 수동 검토표 선존재
    await d1.prepare(
      `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, auto_fields, source, created_at)
       VALUES ('부가세', 2024, 'Person', 100, '{"revenue":111}', 'manual', '2026-01-01')`,
    ).run();
    const conn = await createConnection(d1, 100);
    const eq = await enqueue(d1, conn, 2024);
    await runWorker(d1);
    const job = await d1.prepare(`SELECT raw_id FROM scrape_jobs WHERE id = ?`).bind(eq.body.job_id).first();

    const conflict = await reviewPost(ctx(d1, { search: `?action=approve&raw_id=${job.raw_id}&key=${KEY}`, body: {} }));
    expect(conflict.status).toBe(409);

    const forced = await reviewPost(ctx(d1, { search: `?action=approve&raw_id=${job.raw_id}&key=${KEY}`, body: { force: true } }));
    expect(forced.status).toBe(200);
    const f = await d1.prepare(`SELECT source, verified_at FROM filings WHERE owner_id=100 AND fiscal_year=2024`).first();
    expect(f.source).toBe('scraped');
    expect(f.verified_at).toBeTruthy();
  });

  it('terminal error (fail- ref) → job failed; retryable (retry- ref) → requeued', async () => {
    const connFail = await createConnection(d1, 100);
    await d1.prepare(`UPDATE scrape_connections SET connection_ref = 'fail-x' WHERE id = ?`).bind(connFail).run();
    const f = await enqueue(d1, connFail);
    let w = await runWorker(d1);
    expect(w.failed).toBe(1);
    let job = await d1.prepare(`SELECT status FROM scrape_jobs WHERE id = ?`).bind(f.body.job_id).first();
    expect(job.status).toBe('failed');

    const connRetry = await createConnection(d1, 101);
    await d1.prepare(`UPDATE scrape_connections SET connection_ref = 'retry-x' WHERE id = ?`).bind(connRetry).run();
    const r = await enqueue(d1, connRetry);
    w = await runWorker(d1);
    expect(w.requeued).toBe(1);
    job = await d1.prepare(`SELECT status, attempts FROM scrape_jobs WHERE id = ?`).bind(r.body.job_id).first();
    expect(job.status).toBe('queued');
    expect(job.attempts).toBe(1);
  });

  it('requires admin auth + rejects without key', async () => {
    const conn = await createConnection(d1, 100);
    // key 없음 → checkOriginCsrf(없는 Origin) 또는 checkAdmin 실패로 차단
    const res = await triggerPost(ctx(d1, { body: { connection_id: conn, filing_type: '부가세', fiscal_year: 2024 } }));
    expect([401, 403]).toContain(res.status);
  });

  it('review list returns jobs joined to raw', async () => {
    const conn = await createConnection(d1, 100);
    const eq = await enqueue(d1, conn);
    await runWorker(d1);
    const res = await reviewGet(ctx(d1, { method: 'GET', search: `?key=${KEY}` }));
    const j = await json(res);
    expect(j.ok).toBe(true);
    expect(j.jobs.length).toBeGreaterThanOrEqual(1);
    expect(j.jobs[0].raw_id).toBeTruthy();
  });
});
