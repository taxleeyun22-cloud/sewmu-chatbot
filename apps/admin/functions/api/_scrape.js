// 신고서 스크래핑 — 공유 헬퍼 (Phase 1, 2026-06-17)
//
// 거래처 신고서를 외부 제공사(하이픈·CODEF 등) API 로 가져오는 파이프라인의 D1 스키마 + 정규화.
// 사용처: admin-scrape-trigger.js (enqueue), cron-scrape-worker.js (조회), admin-scrape-review.js (검증).
//
// 🔒 설계 불변식 (보안):
// - 인증정보(공동인증서·간편인증 비밀번호·ID/PW)는 절대 저장하지 않는다.
//   scrape_connections 에는 제공사 측 식별자(connection_ref, 예: CODEF connectedId)만 둔다.
// - 미검증 스크래핑 수치는 챗봇에 노출하지 않는다 (filings.verified_at 게이트 + chat.js WHERE 필터).
//
// 테이블:
// - filings (기존) + 출처/검증 컬럼 (source/scrape_raw_id/scrape_job_id/scraped_at/verified_at/verified_by)
// - scrape_connections : 거래처별 동의 + 연결 참조 (인증정보 없음)
// - scrape_jobs        : D1 작업 큐 (Cloudflare Queues 는 바인딩 필요 → 사용 안 함)
// - scraped_filings_raw: 제공사 원본 응답 (불변 증거 / 재정규화용)

export function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function ensureScrapeTables(db) {
  if (!db) return;

  /* filings 테이블 존재 보장 (admin-filings.ensureFilingsTable 과 동일 스키마 — 독립 호출 안전) */
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS filings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      included_business_ids TEXT,
      auto_fields TEXT,
      review_status TEXT DEFAULT '작성중',
      reviewer_comment TEXT,
      author_user_id INTEGER,
      reviewer_user_id INTEGER,
      reviewed_at TEXT,
      deleted_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`).run();
  } catch {}

  /* filings 출처/검증 컬럼 lazy migration (각각 독립 try/catch — 이미 있으면 throw 무시) */
  const addCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await addCol(`ALTER TABLE filings ADD COLUMN source TEXT DEFAULT 'manual'`); // 'manual' | 'scraped'
  await addCol(`ALTER TABLE filings ADD COLUMN scrape_raw_id INTEGER`);
  await addCol(`ALTER TABLE filings ADD COLUMN scrape_job_id INTEGER`);
  await addCol(`ALTER TABLE filings ADD COLUMN scraped_at TEXT`);
  await addCol(`ALTER TABLE filings ADD COLUMN verified_at TEXT`);   // NULL = 미검증 (챗봇 비노출)
  await addCol(`ALTER TABLE filings ADD COLUMN verified_by INTEGER`);

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS scrape_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      connection_ref TEXT,
      consent_status TEXT DEFAULT 'pending',
      consent_at TEXT,
      consent_source TEXT,
      consent_record TEXT,
      status TEXT DEFAULT 'active',
      last_synced_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_scrape_conn_user ON scrape_connections(user_id)`).run();
  } catch {}

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS scrape_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      filing_type TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      period_label TEXT,
      status TEXT DEFAULT 'queued',
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      next_run_at TEXT,
      locked_at TEXT,
      last_error TEXT,
      raw_id INTEGER,
      requested_by TEXT,
      created_at TEXT,
      updated_at TEXT
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status, next_run_at)`).run();
  } catch {}

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS scraped_filings_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      connection_id INTEGER,
      user_id INTEGER NOT NULL,
      provider TEXT,
      filing_type TEXT,
      fiscal_year INTEGER,
      period_label TEXT,
      raw_payload TEXT,
      normalized TEXT,
      fetched_at TEXT,
      created_at TEXT
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_scraped_raw_user ON scraped_filings_raw(user_id)`).run();
  } catch {}
}

/**
 * 제공사 정규화 결과(NormalizedFiling) → filings.auto_fields JSON 객체.
 * chat.js 의 buildFilingContext 가 읽는 키(revenue / decisive_tax / vat)와 동일하게 맞춘다.
 * 순수 함수 — 단위 테스트 대상.
 *
 * @param {object|null} normalized - { revenue?, decisive_tax?, paid_tax?, submitted?, submitted_at?, vat? }
 * @param {string} filingType - '부가세' | '종소세' | '법인세'
 * @returns {object} auto_fields 로 저장할 객체
 */
export function normalizeToAutoFields(normalized, filingType) {
  const n = normalized || {};
  const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Number(v));
  const out = {
    /* admin-filings 수동 검토표와 동일한 기본 구조 유지 */
    공제감면: [],
    가산세: [],
  };
  const revenue = num(n.revenue);
  const decisive_tax = num(n.decisive_tax);
  const paid_tax = num(n.paid_tax);
  if (revenue !== undefined) out.revenue = revenue;
  if (decisive_tax !== undefined) out.decisive_tax = decisive_tax;
  if (paid_tax !== undefined) out.paid_tax = paid_tax;
  if (typeof n.submitted === 'boolean') out.submitted = n.submitted;
  if (n.submitted_at) out.submitted_at = String(n.submitted_at);
  if (filingType === '부가세' && n.vat && typeof n.vat === 'object') {
    out.vat = n.vat;
  }
  return out;
}

/** 지수 백오프 (분 단위) — 재시도 횟수 기반. attempts: 1→2분, 2→4분, 3→8분 ... 최대 60분. */
export function backoffMinutes(attempts) {
  const m = Math.pow(2, Math.max(1, Number(attempts) || 1));
  return Math.min(m, 60);
}

/* ──────────────────────────────────────────────────────────────────────────
 * 런타임 어댑터 (plain JS) — Cloudflare Pages Function 에서 직접 사용.
 *
 * 주의: functions/api 는 자기완결형 JS (워크스페이스 패키지 import 안 함, 번들 리스크 회피).
 * packages/ai/src/scrape-adapter.ts 는 타입 계약 + 단위테스트 + 향후 CODEF/HYPHEN HTTP
 * 구현 보관용이며, 아래 mock 동작과 동일하게 유지한다 (접두사·결정성 동일).
 * ────────────────────────────────────────────────────────────────────────── */

/** 결정적 문자열 해시 (FNV-1a 32bit). scrape-adapter.ts 와 동일. */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mock 1건 조회 — connectionRef + query 기반 결정적 가짜 신고서. */
async function mockFetchFilings(connectionRef, query) {
  const fetchedAt = new Date().toISOString();
  const ref = connectionRef || '';
  const base = { providerName: 'mock', connectionRef: ref, query, fetchedAt };

  if (ref.startsWith('fail-')) {
    return { ...base, ok: false, rawPayload: { mock: true, simulated: 'auth_denied' },
      error: { code: 'auth_denied', message: 'mock: 인증 거부 (종료)', retryable: false } };
  }
  if (ref.startsWith('retry-')) {
    return { ...base, ok: false, rawPayload: { mock: true, simulated: 'auth_timeout' },
      error: { code: 'auth_timeout', message: 'mock: 간편인증 시간초과 (재시도)', retryable: true } };
  }
  if (ref.startsWith('empty-')) {
    return { ...base, ok: true, rawPayload: { mock: true, 무실적: true },
      normalized: { revenue: 0, decisive_tax: 0, submitted: false } };
  }

  const seed = hash32(`${ref}|${query.type}|${query.fiscalYear}|${query.periodLabel ?? ''}`);
  const revenue = (seed % 90000) * 10000 + 10000000;
  const decisive_tax = Math.round(revenue * 0.012);
  const submitted = query.fiscalYear < new Date().getUTCFullYear();
  const normalized = {
    revenue, decisive_tax,
    paid_tax: submitted ? decisive_tax : 0,
    submitted,
    submitted_at: submitted ? `${query.fiscalYear + 1}-05-31T00:00:00.000Z` : undefined,
  };
  if (query.type === '부가세') {
    const salesVat = Math.round(revenue * 0.1);
    const purchaseVat = Math.round(salesVat * 0.6);
    normalized.vat = { 매출세액: salesVat, 매입세액: purchaseVat, 납부세액: salesVat - purchaseVat };
  }
  return { ...base, ok: true, normalized, rawPayload: { mock: true, seed, normalized } };
}

/** 미구현 제공사 스텁 — 종료성 오류. */
function notImplementedAdapter(name) {
  return {
    name,
    async fetchFilings(connectionRef, query) {
      return {
        ok: false, providerName: name, connectionRef, query,
        rawPayload: null, fetchedAt: new Date().toISOString(),
        error: { code: 'not_implemented', message: `${name} 어댑터 미구현 — 제공사 선정·법무 통과 후 구현`, retryable: false },
      };
    },
  };
}

/**
 * env.SCRAPE_PROVIDER 에 따라 런타임 어댑터 선택. 미설정/미지원 시 Mock (안전 기본값).
 * @returns {{ name: string, fetchFilings: (ref:string, query:object)=>Promise<object> }}
 */
export function getScrapeAdapter(env) {
  const provider = String(env?.SCRAPE_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'codef') return notImplementedAdapter('codef');
  if (provider === 'hyphen') return notImplementedAdapter('hyphen');
  return { name: 'mock', fetchFilings: mockFetchFilings };
}
