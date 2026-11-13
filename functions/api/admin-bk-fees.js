// 기장료 수납 관리 — CMS 회원목록 기준 수납 원장
//
// 사장님 요구:
//   2026-11-12 "거래처 깔아놓고 입금 됐다 안 됐다만 확인. 통장 거래내역이랑 CMS 입금내역이랑."
//              "기장이 들어왔다, 언제 들어왔다, 이거 안됐다, 폐업됐다, 이것도 체크할 수 있도록."
//   2026-11-13 "난 이 4개만 올릴거야 (CMS 회원목록 · CMS 결제조회 · 신용카드 승인조회 · 위하고 명부). 이 4개로 다 할 수 있게."
//              "기본은 CMS 회원목록이고, 정지했거나 그런 건 따로 빼면 됨. 위하고는 사업자번호 등 참조하라고 넣은 거."
//              "이체하는 곳이 있다면 거긴 수기로 등록할 거야."
//   권한: 직원 전체. 화면 = 옛 admin 독립 페이지 bk-fees.html (새 admin 동결).
//
// 설계:
//   - 기준 단위 = bk_clients (기장료 거래처 명단). admin 업체(businesses)와는 별개 —
//     CMS 회원이 admin 업체 목록에 없어도 격자에 나온다. 사업자번호가 같으면 business_id 로 연결만 해 둔다.
//   - CMS 회원목록 = 명단 (회원번호 · 기본금액=월 청구액(부가세 포함) · 결제시작일=시작월 · 결제종료일/신청불능=정지·해지)
//   - CMS 결제조회 · 신용카드 승인조회 = 입금 (성공 건 → ○). 출금일 20일 이후 당월분, 19일 이전 전월분(재출금).
//   - 위하고 명부 = 참조 (상호 + 생년월일/사업자번호 앞자리로 맞춰 사업자번호·대표자·담당만 채움). 주민번호는 앞 6자리만 받는다.
//   - 직접이체 거래처 = [＋ 신규 수임] 으로 수기 등록, ✕ 눌러 입금확인. 통장 내역 업로드도 그대로 지원.
//   - CMS 결과가 올라온 달(자료 범위) 밖은 ✕ 대신 '–' — 자료가 없는 달을 미납으로 보이지 않게.
//
// Endpoints (전부 ?key=ADMIN_KEY 또는 admin 세션):
//   GET  ?action=grid&year=2026&view=active|stopped|all
//   GET  ?action=search_biz&q=        → admin 업체 검색 (거래처 연결·신규 수임용)
//   POST ?action=save_client          { id?, name, ceo_name, business_id, business_number, bill, pay_method, staff_name, bk_start, bk_end, bk_end_reason, memo, as_new }
//   POST ?action=event                { client_id, kind, event_date, memo }   kind: 수임|재개|중단|해지|폐업|담당변경
//   POST ?action=mark_paid            { client_id, period, paid_at, amount, memo }   (수기 입금확인)
//   POST ?action=unmark_paid          { client_id, period }
//   POST ?action=import_cms_members   { rows:[{member_no,member_name,pay_day,amount,member_status,can_withdraw,payer,pay_type,start_date,end_date,key}] }
//   POST ?action=import_cms           { rows:[{member_no,member_name,tx_date,amount,status,reason,method}] }   (계좌 결제조회 · 카드 승인조회)
//   POST ?action=import_wehago        { rows:[{company_name,ceo_name,business_number,staff_name,birth6,closed}] }
//   POST ?action=import_bank          { rows:[{tx_date,amount,payer,memo}] }
//   POST ?action=import_master&mode=preview|commit   { rows:[{company_name,ceo_name,business_number,monthly_fee(공급가),cms_member_no,pay_method,staff_name,bk_start}] }
//   POST ?action=check_biz_status     { limit }   → 국세청 사업자등록상태 (휴·폐업)
//
// 엑셀 파싱은 브라우저(SheetJS)에서 하고 여기로는 JSON rows 만 들어온다.

import { checkAdmin, adminUnauthorized, checkOriginCsrf } from "./_adminAuth.js";
import { logAudit } from "./_audit.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}
function today() { return kst().substring(0, 10); }
function normName(s) { return String(s || '').replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, '').replace(/[\s[\]().·,\-_/]/g, '').toLowerCase(); }
function normBiz(s) { return String(s || '').replace(/\D/g, ''); }
/* 대괄호·괄호 안을 떼고 정규화 — CMS 회원명은 '휴대폰성지 옆커폰 미아점[정미정]' 처럼 꼬리표가 붙는다 */
export function normLoose(s) {
  let v = String(s || '').replace(/\n/g, ' ');
  for (let i = 0; i < 3; i++) v = v.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  return normName(v);
}
/** 상호 비교용 이름들 — 원래 이름, 괄호 뗀 이름, 대괄호 안 이름(위하고는 '[상호]대표자[메모]' 식으로 적기도 한다) */
export function nameKeys(s) {
  const v = new Set([normName(s), normLoose(s)]);
  for (const x of String(s || '').match(/\[[^\]]+\]/g) || []) v.add(normName(x.slice(1, -1)));
  return [...v].filter((x) => x.length >= 2);
}
const SKIP_ROW = /^(합계|총계|소계)/;
function ym(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }
/** '2024-03' / '2024.3' / '2024-03-01' / '202403' / '20240301' → '2024-03' (아니면 null) */
export function normYm(s) {
  const t = String(s || '').trim();
  const m = t.match(/^(\d{4})\D+(\d{1,2})(?:\D|$)/) || t.match(/^(\d{4})(\d{2})(?:\d{2})?$/);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return ym(m[1], mo);
}
/** '20261112' / '2026-11-12' / '2026.11.12 14:00' → '2026-11-12' */
function normYmd(s) {
  const d = String(s || '').replace(/\D/g, '').slice(0, 8);
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
}
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const money = (v) => Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, ''))) || 0;
const NOT_DELETED = `(deleted_at IS NULL OR deleted_at = '')`;
export const EVENT_KINDS = ['수임', '재개', '중단', '해지', '폐업', '담당변경'];
const START_KINDS = ['수임', '재개'];
const STOP_KINDS = ['중단', '해지', '폐업'];
const CMS_OK = ['출금성공', '재출금성공', '승인성공'];
const CMS_PENDING = ['출금중', '재출금중', '승인중'];

/* ---------- 테이블 ---------- */
const CLIENT_SQL = `CREATE TABLE IF NOT EXISTS bk_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_no TEXT,
    name TEXT NOT NULL,
    ceo_name TEXT,
    business_number TEXT,
    business_id INTEGER,
    bill INTEGER,
    pay_method TEXT,
    pay_day INTEGER,
    staff_name TEXT,
    bk_start TEXT,
    bk_end TEXT,
    bk_end_reason TEXT,
    cms_state TEXT,
    can_withdraw TEXT,
    payer TEXT,
    cms_key TEXT,
    wehago_name TEXT,
    wehago_closed INTEGER DEFAULT 0,
    nts_status TEXT,
    nts_checked_at TEXT,
    source TEXT,
    memo TEXT,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
  )`;
const DDL = [
  CLIENT_SQL,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_bkcl_member ON bk_clients(member_no)`,
  `CREATE TABLE IF NOT EXISTS bk_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    amount INTEGER,
    paid_at TEXT,
    source TEXT,
    source_ref TEXT,
    memo TEXT,
    confirmed_by_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(client_id, period)
  )`,
  `CREATE TABLE IF NOT EXISTS bk_client_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    event_date TEXT NOT NULL,
    kind TEXT NOT NULL,
    memo TEXT,
    created_by_id INTEGER,
    created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bkce_client ON bk_client_events(client_id, event_date)`,
  /* CMS 출금·승인 원본 (재업로드해도 중복 안 쌓이게 UNIQUE). 2026-11-12 부터 있던 표 그대로 */
  `CREATE TABLE IF NOT EXISTS bk_cms_tx (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_no TEXT,
    member_name TEXT,
    tx_date TEXT,
    amount INTEGER,
    status TEXT,
    reason TEXT,
    method TEXT,
    business_id INTEGER,
    period TEXT,
    source_file TEXT,
    created_at TEXT,
    UNIQUE(member_no, tx_date, amount, status, method)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bkcms_period ON bk_cms_tx(period)`,
  `CREATE TABLE IF NOT EXISTS bk_bank_tx (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_date TEXT,
    amount INTEGER,
    payer TEXT,
    memo TEXT,
    business_id INTEGER,
    period TEXT,
    matched_by TEXT,
    source_file TEXT,
    created_at TEXT,
    UNIQUE(tx_date, amount, payer, memo)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bkbank_date ON bk_bank_tx(tx_date)`,
  /* 위하고 명부 (참조용) — 사업자번호 기준 한 줄. 주민번호는 앞 6자리(생년월일)만 */
  `CREATE TABLE IF NOT EXISTS bk_wehago (
    business_number TEXT PRIMARY KEY,
    name TEXT,
    ceo_name TEXT,
    staff_name TEXT,
    birth6 TEXT,
    closed INTEGER DEFAULT 0,
    updated_at TEXT
  )`,
];

/* 테이블 준비 — 같은 DB 객체에는 한 번만 (D1 은 요청당 쿼리 수 제한이 있다) */
const _schemaReady = new WeakSet();
async function ensureSchema(db) {
  if (_schemaReady.has(db)) return;
  await db.batch(DDL.map((sql) => db.prepare(sql)));
  /* 2026-11-13 오전에 올린 CMS 결과는 날짜가 '20261112' 꼴로 저장됐다 — 'YYYY-MM-DD' 로 맞춰 재업로드 중복을 막는다 */
  try {
    await db.prepare(`UPDATE OR IGNORE bk_cms_tx SET tx_date = substr(tx_date,1,4)||'-'||substr(tx_date,5,2)||'-'||substr(tx_date,7,2)
                       WHERE length(tx_date) = 8 AND tx_date NOT LIKE '%-%'`).run();
  } catch {}
  /* bk_bank_tx 에 client_id 칸 (옛 표에는 business_id 만 있었다) */
  try {
    const { results } = await db.prepare(`PRAGMA table_info(bk_bank_tx)`).all();
    if (!(results || []).some((c) => c.name === 'client_id')) {
      try { await db.prepare(`ALTER TABLE bk_bank_tx ADD COLUMN client_id INTEGER`).run(); } catch {}
    }
  } catch {}
  _schemaReady.add(db);
}
/** 쓰기를 묶어서 실행 (D1 batch = 한 번 왕복). 결과는 문장 순서대로. */
async function runBatch(db, stmts, size = 50) {
  const out = [];
  for (let i = 0; i < stmts.length; i += size) out.push(...(await db.batch(stmts.slice(i, i + size))));
  return out;
}
const didChange = (r) => !!(r && r.meta && r.meta.changes);

/* CMS 출금일 → 귀속월. 1차 출금은 25~28일, 실패분 재출금은 다음달 1~10일.
 * 20일 이후 = 당월분 / 19일 이전 = 전월분 재출금 으로 본다. */
export function cmsPeriod(txDate) {
  const d = String(txDate || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  let y = +d.slice(0, 4), m = +d.slice(4, 6);
  const day = +d.slice(6, 8);
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  if (day < 20) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  return ym(y, m);
}

/** 지금(KST) 기준 그 해의 마감된 마지막 달. CMS 출금일이 25~26일이라 27일 전이면 이번 달은 아직 미도래. */
export function lastClosedMonth(year, now = new Date(Date.now() + 9 * 3600 * 1000)) {
  const curY = now.getUTCFullYear(), curM = now.getUTCMonth() + 1, curD = now.getUTCDate();
  if (year < curY) return 12;
  if (year > curY) return 0;
  return curD >= 27 ? curM : curM - 1;
}

/** 그 달에 기장 중이었나 — 계약 구간 안 + (중단·해지·폐업 ~ 재개·수임) 사이가 아님.
 *  중단 이벤트가 있는 달은 그 달까지 청구, 재개 이벤트가 있는 달부터 다시 청구. */
export function activeIn(period, c, events) {
  if (c.bk_start && period < c.bk_start) return false;
  if (c.bk_end && period > c.bk_end) return false;
  let active = true;
  for (const e of events || []) {                     /* event_date 오름차순 */
    const em = String(e.event_date || '').substring(0, 7);
    if (STOP_KINDS.includes(e.kind) && em < period) active = false;
    else if (START_KINDS.includes(e.kind) && em <= period) active = true;
  }
  return active;
}

/** 정지·해지 사유 ('' = 진행 중) — CMS 신청불능 / 결제종료일이 지남 / 해지·폐업으로 종료 /
    출금불가인데 올린 결제조회 기간 내내 출금 시도가 한 번도 없음 (hasTx === false 일 때만 — 결제조회를 안 올렸으면 판단 안 함) */
export function stopReason(c, nowYm = today().substring(0, 7), hasTx) {
  if (c.cms_state && c.cms_state !== '신청완료') return 'CMS ' + c.cms_state;
  if (c.bk_end && c.bk_end < nowYm) return (c.bk_end_reason || '종료') + ' ' + c.bk_end;
  if (c.member_no && c.can_withdraw && c.can_withdraw !== '출금가능' && hasTx === false) return c.can_withdraw + ' · 출금 기록 없음';
  return '';
}
export function isStopped(c, nowYm, hasTx) { return !!stopReason(c, nowYm, hasTx); }

/** 출금 기록이 있는 회원번호 (결제조회를 아직 안 올렸으면 null) */
async function membersWithTx(db) {
  const { results } = await db.prepare(`SELECT DISTINCT member_no FROM bk_cms_tx`).all();
  return results && results.length ? new Set(results.map((r) => r.member_no)) : null;
}

/** CMS 생년월일/사업자번호 칸 → 맞춤용 키만: 개인 = 생년월일 6자리, 사업자 = 앞 5자리.
    주민번호 뒷자리는 (가려져 있지 않아도) 절대 저장하지 않는다. */
export function cmsKey(raw) {
  const v = String(raw || '').trim();
  if (/^\d{6}(-|$|\s|\*)/.test(v)) return v.slice(0, 6);
  /* 사업자번호 — CMS 파일은 '12345*****' 처럼 앞 5자리만 보여 준다 (2026-11-13 실제 파일 38곳) */
  const d = v.replace(/-/g, '');
  if (/^\d{5}[\d*]{5}$/.test(d) || /^\d{5}$/.test(d)) return d.slice(0, 5);   /* 화면이 이미 5자리로 잘라 보냄 */
  return null;
}

/** 공공데이터포털 인증키 → URL 에 넣을 serviceKey (한 번만 인코딩). Encoding·Decoding 키 아무거나. */
export function ntsServiceKey(raw) {
  const k = String(raw || '').trim();
  if (!k) return '';
  let plain = k;
  if (/%[0-9A-Fa-f]{2}/.test(k)) { try { plain = decodeURIComponent(k); } catch { plain = k; } }
  return encodeURIComponent(plain);
}

/** CMS 성공 거래 → 원장 ○ (회원번호로 거래처 연결). 이미 ○ 인 달은 그대로. 언제 돌려도 같은 결과. */
/* CMS 기록 → 장부. 다시 돌려도 결과가 같다 (회원목록·결제조회 어느 쪽을 먼저 올려도 됨).
   귀속월 = 그 거래처 약정일 기준: 출금일이 약정일(25일 넘으면 25일 — 말일 약정이 2월·휴일로 당겨져도) 이후면 그 달, 전이면 전달(재출금).
   약정일을 모르면 20일 기준. 2026-11-13 실제 파일: 약정일 25일 189곳·19일·30일·1일 각 1곳.
   CMS 가 만든 칸(source CMS·CMS카드)만 지우고 다시 만든다 — 수기 입금확인은 그대로. */
async function deriveCmsLedger(db) {
  const now = kst();
  await db.batch([
    db.prepare(
      `UPDATE bk_cms_tx SET period = CASE
         WHEN CAST(substr(tx_date, 9, 2) AS INTEGER) >= MIN(25, COALESCE((
              SELECT c.pay_day FROM bk_clients c WHERE c.member_no = bk_cms_tx.member_no
                AND c.pay_day BETWEEN 1 AND 31 AND (c.deleted_at IS NULL OR c.deleted_at = '') LIMIT 1), 20))
           THEN substr(tx_date, 1, 7)
         ELSE strftime('%Y-%m', substr(tx_date, 1, 7) || '-01', '-1 month') END
       WHERE tx_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'`
    ),
    db.prepare(`DELETE FROM bk_ledger WHERE source IN ('CMS', 'CMS카드')`),
    db.prepare(
      `INSERT INTO bk_ledger (client_id, period, amount, paid_at, source, source_ref, created_at, updated_at)
       SELECT c.id, t.period, MAX(t.amount), MIN(substr(t.tx_date, 1, 10)),
              CASE WHEN MAX(t.method) = 'CMS카드' THEN 'CMS카드' ELSE 'CMS' END, MIN(t.member_no), ?1, ?1
         FROM bk_cms_tx t JOIN bk_clients c ON c.member_no = t.member_no AND (c.deleted_at IS NULL OR c.deleted_at = '')
        WHERE t.status IN ('출금성공','재출금성공','승인성공') AND t.period IS NOT NULL
        GROUP BY c.id, t.period
       ON CONFLICT(client_id, period) DO UPDATE SET
         paid_at = COALESCE(bk_ledger.paid_at, excluded.paid_at),
         source = COALESCE(bk_ledger.source, excluded.source),
         source_ref = COALESCE(bk_ledger.source_ref, excluded.source_ref),
         amount = COALESCE(bk_ledger.amount, excluded.amount),
         updated_at = excluded.updated_at`
    ).bind(now),
  ]);
}

/** 위하고 명부·admin 업체와 다시 맞추기 — 회원목록·위하고 어느 쪽을 먼저 올려도 결과가 같게.
 *  자동으로 채우는 건 확실할 때만: 상호가 정확히 같고 한 곳, 또는 이름이 비슷하고 생년월일·사업자번호 앞자리까지 맞을 때.
 *  이미 들어 있는 사업자번호·대표자·담당은 덮어쓰지 않는다. */
async function relink(db) {
  const { results: clients } = await db.prepare(
    `SELECT id, name, ceo_name, business_number, business_id, staff_name, cms_key, wehago_name, wehago_closed FROM bk_clients WHERE ${NOT_DELETED}`
  ).all();
  const { results: wh } = await db.prepare(`SELECT * FROM bk_wehago`).all();
  const { results: biz } = await db.prepare(
    `SELECT id, business_number FROM businesses WHERE ${NOT_DELETED} AND business_number IS NOT NULL AND business_number != ''`
  ).all();
  const wrows = (wh || []).map((w) => ({ ...w, keys: nameKeys(w.name) }));
  const byKey = {};
  for (const w of wrows) for (const k of w.keys) (byKey[k] ||= []).push(w);
  const bizByBn = {};
  for (const b of biz || []) { const k = normBiz(b.business_number); if (k.length === 10) (bizByBn[k] ||= []).push(b.id); }

  const writes = [], unmatched = [];
  let matched = 0, linked = 0;
  const now = kst();
  for (const c of clients || []) {
    const sets = [], vals = [];
    let bn = normBiz(c.business_number);
    let w = null;
    if (bn.length === 10) w = wrows.find((x) => normBiz(x.business_number) === bn) || null;
    if (!w && wrows.length) {
      const ck = nameKeys(c.name);
      let cand = [...new Set(ck.flatMap((k) => byKey[k] || []))];
      let exact = cand.length > 0;
      if (!cand.length) {
        cand = wrows.filter((x) => x.keys.some((k) => k.length >= 4 && ck.some((q) => q.length >= 4 && (k.includes(q) || q.includes(k)))));
      }
      const live = cand.filter((x) => !x.closed);
      if (live.length) cand = live;
      /* 생년월일(개인) · 사업자번호 앞 5자리(법인)로 가린다 */
      const key = String(c.cms_key || '').trim();
      const byBirth = /^\d{6}$/.test(key) ? cand.filter((x) => x.birth6 === key) : [];
      const byPrefix = /^\d{5}/.test(key) && !/^\d{6}$/.test(key) ? cand.filter((x) => normBiz(x.business_number).startsWith(key.slice(0, 5))) : [];
      const verified = byBirth.length === 1 ? byBirth : byPrefix.length === 1 ? byPrefix : null;
      if (verified) w = verified[0];
      else if (exact && cand.length === 1) w = cand[0];
    }
    if (w) {
      matched++;
      if (bn.length !== 10) { bn = normBiz(w.business_number); sets.push('business_number = ?'); vals.push(w.business_number); }
      if (!c.ceo_name && w.ceo_name) { sets.push('ceo_name = ?'); vals.push(w.ceo_name); }
      if (!c.staff_name && w.staff_name) { sets.push('staff_name = ?'); vals.push(w.staff_name); }
      if (c.wehago_name !== w.name || Number(c.wehago_closed || 0) !== (w.closed ? 1 : 0)) {
        sets.push('wehago_name = ?', 'wehago_closed = ?'); vals.push(w.name, w.closed ? 1 : 0);
      }
    } else if (wrows.length) unmatched.push({ id: c.id, name: c.name });
    /* admin 업체 연결 — 사업자번호가 같은 곳이 딱 한 곳일 때만 */
    if (!c.business_id && bn.length === 10 && (bizByBn[bn] || []).length === 1) {
      sets.push('business_id = ?'); vals.push(bizByBn[bn][0]); linked++;
    }
    if (sets.length) {
      sets.push('updated_at = ?'); vals.push(now, c.id);
      writes.push(db.prepare(`UPDATE bk_clients SET ${sets.join(', ')} WHERE id = ?`).bind(...vals));
    }
  }
  await runBatch(db, writes);
  return { matched, linked, unmatched };
}

const errJson = (msg, status = 400) => Response.json({ error: msg }, { status });

/* ============================ GET ============================ */
export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return errJson('DB 연결 없음', 500);
  try {
    await ensureSchema(db);
    const url = new URL(context.request.url);
    const action = url.searchParams.get('action') || 'grid';
    const year = Number(url.searchParams.get('year')) || new Date().getFullYear();

    /* admin 업체 검색 — 거래처 연결 · 신규 수임 */
    if (action === 'search_biz') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 40);
      if (!q) return Response.json({ ok: true, results: [] });
      const dq = q.replace(/\D/g, '');
      const { results } = await db.prepare(
        `SELECT id, company_name, ceo_name, business_number FROM businesses
          WHERE ${NOT_DELETED} AND (company_name LIKE ?1 OR ceo_name LIKE ?1
                OR (?2 != '' AND REPLACE(business_number, '-', '') LIKE ?3))
          ORDER BY company_name LIMIT 30`
      ).bind(`%${q}%`, dq, `%${dq}%`).all();
      return Response.json({ ok: true, results: results || [] });
    }

    if (action === 'grid') {
      const view = ['stopped', 'all'].includes(url.searchParams.get('view')) ? url.searchParams.get('view') : 'active';
      const { results: cl } = await db.prepare(
        `SELECT * FROM bk_clients WHERE ${NOT_DELETED} AND bill IS NOT NULL AND bill > 0 ORDER BY staff_name, name`
      ).all();
      const { results: led } = await db.prepare(
        `SELECT client_id, period, amount, paid_at, source FROM bk_ledger WHERE period LIKE ?1`
      ).bind(`${year}-%`).all();
      const { results: evs } = await db.prepare(
        `SELECT client_id, event_date, kind, memo FROM bk_client_events ORDER BY event_date, id`
      ).all();
      /* CMS 시도 기록 (실패 사유·출금중) + 자료 범위 */
      const { results: tx } = await db.prepare(
        `SELECT member_no, period, status, reason, tx_date FROM bk_cms_tx WHERE period LIKE ?1 ORDER BY tx_date`
      ).bind(`${year}-%`).all();
      /* 자료 범위 — 결제수단별로. 시작 = 그 달 본출금(약정일 이후 출금)이 파일에 있는 첫 달.
         (5월 초 재출금만 있는 4월은 본출금이 빠져 있어 ✕ 로 찍으면 안 된다 — 2026-11-13 실제 파일) */
      const { results: covRows } = await db.prepare(
        `SELECT method, period, COUNT(DISTINCT member_no) AS n FROM bk_cms_tx
          WHERE period IS NOT NULL AND substr(tx_date, 1, 7) = period GROUP BY method, period`
      ).all();
      /* 본출금 회원 수가 가장 많은 달의 절반 이상인 달만 "자료 있음" — 약정일 1일 한 곳의 11/2 출금만으로
         11월을 자료 있음으로 보면 27일 이후 나머지 거래처가 전부 ✕ 가 된다 (2026-11-13 검토) */
      const covBy = {};
      const closedYm = (() => { const t = today(); const y = +t.slice(0, 4), m = +t.slice(5, 7);
        return +t.slice(8, 10) >= 27 ? ym(y, m) : (m === 1 ? ym(y - 1, 12) : ym(y, m - 1)); })();
      const perMethod = {};
      for (const r of covRows || []) (perMethod[r.method] ||= []).push(r);
      for (const [mth, list] of Object.entries(perMethod)) {
        const max = Math.max(...list.map((r) => r.n));
        const ok = list.filter((r) => r.n * 2 >= max && r.period <= closedYm).map((r) => r.period).sort();
        if (ok.length) covBy[mth] = { from: ok[0], to: ok[ok.length - 1] };
      }
      const covOf = (c) => covBy[c.pay_method === 'CMS카드' ? 'CMS카드' : 'CMS계좌'] || null;

      const ledBy = {};
      for (const r of led || []) (ledBy[r.client_id] ||= {})[r.period] = r;
      const evBy = {};
      for (const e of evs || []) (evBy[e.client_id] ||= []).push(e);
      const txBy = {};
      for (const t of tx || []) (txBy[t.member_no + '|' + t.period] ||= []).push(t);

      const lastClosed = lastClosedMonth(year);
      const nowYm = today().substring(0, 7);
      const txMembers = await membersWithTx(db);
      let stoppedCount = 0, activeCount = 0;
      const rows = [];
      for (const c of cl || []) {
        const stop = stopReason(c, nowYm, txMembers && c.member_no ? txMembers.has(c.member_no) : undefined);
        const stopped = !!stop;
        if (stopped) stoppedCount++; else activeCount++;
        if ((view === 'active' && stopped) || (view === 'stopped' && !stopped)) continue;
        const events = evBy[c.id] || [];
        const isCms = !!c.member_no;
        const cov = isCms ? covOf(c) : null;
        const cells = [];
        for (let m = 1; m <= 12; m++) {
          const p = ym(year, m);
          const rec = ledBy[c.id]?.[p];
          if (rec && rec.paid_at) { cells.push({ s: 'o', d: rec.paid_at, a: rec.amount || c.bill, src: rec.source || '' }); continue; }
          if (!activeIn(p, c, events)) { cells.push({ s: '-' }); continue; }
          if (m > lastClosed) { cells.push({ s: '-', future: true }); continue; }
          if (isCms && (!cov || p < cov.from || p > cov.to)) { cells.push({ s: '-', nodata: true }); continue; }
          const tries = isCms ? (txBy[c.member_no + '|' + p] || []) : [];
          const last = tries[tries.length - 1];
          if (last && CMS_PENDING.includes(last.status)) { cells.push({ s: 'p', a: c.bill, why: last.status }); continue; }
          const why = last ? (last.status + (last.reason && last.reason !== '정상' ? ' · ' + last.reason : ''))
            : isCms ? (c.can_withdraw && c.can_withdraw !== '출금가능' ? c.can_withdraw + ' — CMS 출금 시도 없음' : 'CMS 출금 기록 없음')
            : '';
          cells.push({ s: 'x', a: (rec && rec.amount) || c.bill, why });
        }
        rows.push({
          id: c.id, name: c.name, ceo: c.ceo_name || '', biz_no: c.business_number || '', business_id: c.business_id || null,
          staff: c.staff_name || '', fee: c.bill, cms: c.member_no || '', pay: c.pay_method || '', pay_day: c.pay_day || null,
          start: c.bk_start || '', end: c.bk_end || '', end_reason: c.bk_end_reason || '',
          nts: c.nts_status || '', cms_st: c.can_withdraw || '', cms_state: c.cms_state || '',
          wehago: c.wehago_name || '', wehago_closed: !!c.wehago_closed, source: c.source || '',
          stopped, stop_reason: stop, events, cells,
        });
      }
      const openAmt = rows.reduce((a, r) => a + r.cells.filter(x => x.s === 'x').reduce((s, x) => s + (x.a || 0), 0), 0);
      return Response.json({
        ok: true, year, view, lastClosed, coverage: covBy['CMS계좌'] || covBy['CMS카드'] || null, coverage_by: covBy, rows,
        total: { active: activeCount, stopped: stoppedCount, biz: rows.length, openAmt, openBiz: rows.filter(r => r.cells.some(x => x.s === 'x')).length },
      });
    }

    return errJson('unknown_action');
  } catch (e) {
    console.error('[admin-bk-fees GET]', e);
    return errJson('기장료 현황을 불러오지 못했습니다', 500);
  }
}

/* ============================ POST ============================ */
export async function onRequestPost(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return errJson('DB 연결 없음', 500);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const body = await context.request.json().catch(() => ({}));
  const uid = auth.userId || null;
  const actor = auth.owner ? 'owner' : ('staff#' + (uid || '?'));
  const audit = (act, entity_id, after) =>
    logAudit(db, { actor, action: act, entity_type: 'bk_client', entity_id, after, request: context.request });

  try {
    await ensureSchema(db);

    /* ---- 거래처 저장 (수정 · 신규 수임) ---- */
    if (action === 'save_client') {
      const id = Number(body.id) || null;
      const sets = {}, now = kst();
      if ('name' in body) {
        const n = String(body.name || '').trim().slice(0, 80);
        if (!n) return errJson('거래처 이름을 적어 주세요');
        sets.name = n;
      }
      if ('bill' in body) {
        const n = body.bill === '' || body.bill == null ? null : money(body.bill);
        if (n !== null && n <= 0) return errJson('월 기장료(부가세 포함)를 숫자로 적어 주세요');
        sets.bill = n;
      }
      for (const k of ['ceo_name', 'business_number', 'pay_method', 'staff_name', 'bk_end_reason', 'memo']) {
        if (k in body) sets[k] = body[k] === '' || body[k] == null ? null : String(body[k]).trim().slice(0, k === 'memo' ? 300 : 60);
      }
      if ('business_id' in body) sets.business_id = Number(body.business_id) || null;
      for (const k of ['bk_start', 'bk_end']) {
        if (!(k in body)) continue;
        if (body[k] === '' || body[k] == null) { sets[k] = null; continue; }
        const v = normYm(body[k]);
        if (!v) return errJson('기장 시작·종료는 YYYY-MM 으로 적어 주세요');
        sets[k] = v;
      }
      let clientId = id;
      if (!id) {
        if (!sets.name || !sets.bill) return errJson('신규 수임은 거래처 이름과 월 기장료가 필요합니다');
        sets.bk_start = sets.bk_start || today().substring(0, 7);
        sets.pay_method = sets.pay_method || '직접이체';
        const cols = Object.keys(sets);
        const r = await db.prepare(
          `INSERT INTO bk_clients (${cols.join(', ')}, source, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, 'manual', ?, ?)`
        ).bind(...cols.map((k) => sets[k]), now, now).run();
        clientId = r.meta?.last_row_id;
        await db.prepare(
          `INSERT INTO bk_client_events (client_id, event_date, kind, memo, created_by_id, created_at) VALUES (?1,?2,'수임',?3,?4,?5)`
        ).bind(clientId, sets.bk_start + '-01', sets.memo || null, uid, now).run();
      } else {
        const cols = Object.keys(sets);
        if (!cols.length) return errJson('바꿀 내용이 없습니다');
        await db.prepare(`UPDATE bk_clients SET ${cols.map((k) => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`)
          .bind(...cols.map((k) => sets[k]), now, id).run();
      }
      await audit(id ? 'bk_client_save' : 'bk_client_new', clientId, sets);
      return Response.json({ ok: true, id: clientId });
    }

    /* ---- 생애주기 이벤트 ---- */
    if (action === 'event') {
      const client_id = Number(body.client_id);
      const kind = String(body.kind || '');
      if (!client_id || !EVENT_KINDS.includes(kind)) return errJson('거래처와 구분(수임·재개·중단·해지·폐업·담당변경)이 필요합니다');
      const d = body.event_date ? String(body.event_date) : today();
      if (!isYmd(d)) return errJson('날짜는 YYYY-MM-DD 로 적어 주세요');
      const p = d.substring(0, 7);
      const memo = body.memo ? String(body.memo).slice(0, 300) : null;
      await db.prepare(
        `INSERT INTO bk_client_events (client_id, event_date, kind, memo, created_by_id, created_at) VALUES (?1,?2,?3,?4,?5,?6)`
      ).bind(client_id, d, kind, memo, uid, kst()).run();
      /* 재개·수임은 시작월을 덮어쓰지 않는다 (덮어쓰면 그 전 입금 이력이 격자에서 사라짐) */
      if (START_KINDS.includes(kind)) {
        await db.prepare(
          `UPDATE bk_clients SET bk_start = CASE WHEN bk_start IS NULL OR bk_start = '' OR bk_start > ?1 THEN ?1 ELSE bk_start END,
                  bk_end = NULL, bk_end_reason = NULL, updated_at = ?2 WHERE id = ?3`
        ).bind(p, kst(), client_id).run();
      } else if (STOP_KINDS.includes(kind)) {
        await db.prepare(`UPDATE bk_clients SET bk_end = ?1, bk_end_reason = ?2, updated_at = ?3 WHERE id = ?4`)
          .bind(p, kind, kst(), client_id).run();
      }
      await audit('bk_event', client_id, { kind, event_date: d, memo });
      return Response.json({ ok: true });
    }

    /* ---- 수기 입금확인 / 해제 ---- */
    if (action === 'mark_paid' || action === 'unmark_paid') {
      const client_id = Number(body.client_id);
      const period = normYm(body.period);
      if (!client_id || !period) return errJson('거래처와 귀속월(YYYY-MM)이 필요합니다');
      if (action === 'unmark_paid') {
        await db.prepare(`UPDATE bk_ledger SET paid_at = NULL, source = NULL, source_ref = NULL, updated_at = ?1
                           WHERE client_id = ?2 AND period = ?3 AND source = '수기'`).bind(kst(), client_id, period).run();
        await audit('bk_unmark_paid', client_id, { period });
        return Response.json({ ok: true });
      }
      const paidAt = body.paid_at ? String(body.paid_at) : today();
      if (!isYmd(paidAt)) return errJson('입금일은 YYYY-MM-DD 로 적어 주세요');
      const c = await db.prepare(`SELECT bill FROM bk_clients WHERE id = ?1`).bind(client_id).first();
      const given = Number(body.amount);
      const amt = Number.isFinite(given) && given > 0 ? Math.round(given) : (c?.bill || 0);
      const memo = body.memo ? String(body.memo).slice(0, 300) : null;
      await db.prepare(
        `INSERT INTO bk_ledger (client_id, period, amount, paid_at, source, memo, confirmed_by_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,'수기',?5,?6,?7,?7)
         ON CONFLICT(client_id, period) DO UPDATE SET
           paid_at = excluded.paid_at, source = excluded.source, memo = excluded.memo,
           amount = COALESCE(bk_ledger.amount, excluded.amount),
           confirmed_by_id = excluded.confirmed_by_id, updated_at = excluded.updated_at`
      ).bind(client_id, period, amt, paidAt, memo, uid, kst()).run();
      await audit('bk_mark_paid', client_id, { period, amount: amt, paid_at: paidAt });
      return Response.json({ ok: true });
    }

    /* ---- CMS 회원목록 = 기장료 거래처 명단 ----
       회원번호마다 한 거래처. 기본금액 = 월 청구액(부가세 포함), 결제시작일 = 시작월(이미 있으면 유지),
       결제종료일(9999 아닌 것) = 종료월, 회원상태 신청불능 = 정지. 다시 올리면 금액·상태만 최신으로. */
    if (action === 'import_cms_members') {
      const rows = (Array.isArray(body.rows) ? body.rows.slice(0, 3000) : []).filter((r) => {
        const no = String(r.member_no || '').trim();
        return /^M\d+$/i.test(no) && !SKIP_ROW.test(String(r.member_name || '').trim());
      });
      if (!rows.length) return errJson('읽을 회원 행이 없습니다');
      const { results: had } = await db.prepare(`SELECT member_no FROM bk_clients WHERE member_no IS NOT NULL`).all();
      const known = new Set((had || []).map((x) => x.member_no));
      const now = kst();
      let added = 0, updated = 0;
      const stmts = [];
      for (const r of rows) {
        const no = String(r.member_no).trim().toUpperCase();
        const name = String(r.member_name || '').trim().slice(0, 80) || no;
        const bill = money(r.amount) || null;
        const start = normYm(r.start_date);
        const endRaw = String(r.end_date || '').replace(/\D/g, '');
        const end = endRaw && !endRaw.startsWith('9999') ? normYm(endRaw) : null;
        const payType = String(r.pay_type || '').trim();
        const method = /카드/.test(payType) ? 'CMS카드' : 'CMS계좌';
        if (known.has(no)) updated++; else { added++; known.add(no); }
        stmts.push(db.prepare(
          `INSERT INTO bk_clients (member_no, name, bill, pay_method, pay_day, bk_start, bk_end, bk_end_reason,
                                   cms_state, can_withdraw, payer, cms_key, source, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'cms',?13,?13)
           ON CONFLICT(member_no) DO UPDATE SET
             name = excluded.name, bill = COALESCE(excluded.bill, bk_clients.bill), pay_method = excluded.pay_method,
             pay_day = excluded.pay_day, bk_start = COALESCE(bk_clients.bk_start, excluded.bk_start),
             bk_end = CASE WHEN excluded.bk_end IS NOT NULL THEN excluded.bk_end
                           WHEN bk_clients.bk_end_reason = 'CMS종료' THEN NULL ELSE bk_clients.bk_end END,
             bk_end_reason = CASE WHEN excluded.bk_end IS NOT NULL THEN COALESCE(bk_clients.bk_end_reason, 'CMS종료')
                                  WHEN bk_clients.bk_end_reason = 'CMS종료' THEN NULL ELSE bk_clients.bk_end_reason END,
             cms_state = excluded.cms_state, can_withdraw = excluded.can_withdraw, payer = excluded.payer,
             cms_key = excluded.cms_key, deleted_at = NULL, updated_at = excluded.updated_at`
        ).bind(no, name, bill, method, Number(String(r.pay_day || '').replace(/\D/g, '')) || null, start, end, end ? 'CMS종료' : null,
               String(r.member_status || '').trim() || null, String(r.can_withdraw || '').trim() || null,
               r.payer ? String(r.payer).trim().slice(0, 60) : null,
               cmsKey(r.key), now));
      }
      await runBatch(db, stmts);
      await deriveCmsLedger(db);
      const link = await relink(db);
      const txm = await membersWithTx(db);
      const { results: all } = await db.prepare(
        `SELECT member_no, cms_state, can_withdraw, bk_end, bk_end_reason FROM bk_clients
          WHERE member_no IS NOT NULL AND ${NOT_DELETED} AND bill IS NOT NULL AND bill > 0`
      ).all();
      const nowYm = today().substring(0, 7);
      const st = { active: 0, stopped: 0, blocked: 0 };
      for (const c of all || []) {
        if (isStopped(c, nowYm, txm ? txm.has(c.member_no) : undefined)) st.stopped++;
        else { st.active++; if (c.can_withdraw && c.can_withdraw !== '출금가능') st.blocked++; }
      }
      await logAudit(db, { actor, action: 'bk_cms_members_import', entity_type: 'bk_client', entity_id: null,
        after: { rows: rows.length, added, updated, source_file: body.source_file || null }, request: context.request });
      return Response.json({ ok: true, rows: rows.length, added, updated,
        active: st?.active || 0, stopped: st?.stopped || 0, blocked: st?.blocked || 0,
        wehago_matched: link.matched, business_linked: link.linked,
        wehago_unmatched: link.unmatched.slice(0, 60).map((x) => x.name), wehago_unmatched_count: link.unmatched.length });
    }

    /* ---- CMS 결과 (계좌 결제조회 · 카드 승인조회) ---- */
    if (action === 'import_cms') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 8000) : [];
      if (!rows.length) return errJson('읽을 행이 없습니다');
      const { results: had } = await db.prepare(`SELECT member_no FROM bk_clients WHERE member_no IS NOT NULL AND ${NOT_DELETED}`).all();
      const known = new Set((had || []).map((x) => x.member_no));
      const unknown = new Set();
      const now = kst();
      const stmts = [];
      let ok = 0, fail = 0, pending = 0;
      for (const r of rows) {
        const no = String(r.member_no || '').trim().toUpperCase();
        if (!/^M\d+$/.test(no)) continue;                 /* 합계 줄 등 */
        const d = normYmd(r.tx_date);
        if (!d) continue;
        if (!known.has(no)) unknown.add(no + ' / ' + (r.member_name || ''));
        const status = String(r.status || '').trim();
        if (CMS_OK.includes(status)) ok++; else if (CMS_PENDING.includes(status)) pending++; else fail++;
        stmts.push(db.prepare(
          `INSERT OR IGNORE INTO bk_cms_tx (member_no, member_name, tx_date, amount, status, reason, method, period, source_file, created_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
        ).bind(no, r.member_name || null, d, money(r.amount), status, String(r.reason || '').trim(),
               r.method === 'CMS카드' ? 'CMS카드' : 'CMS계좌', cmsPeriod(d), body.source_file || null, now));
      }
      const res = await runBatch(db, stmts);
      const saved = res.filter(didChange).length;
      await deriveCmsLedger(db);
      /* 회원목록을 아직 안 올렸으면 "모르는 회원" 이 아니라 "회원목록 올리면 반영" — 순서 상관없이 올려도 된다 */
      const membersPending = known.size === 0;
      return Response.json({ ok: true, saved, duplicate: res.length - saved, success: ok, failed: fail, pending,
                             members_pending: membersPending,
                             unknown_members: membersPending ? [] : [...unknown].slice(0, 100) });
    }

    /* ---- 위하고 명부 (참조) — 사업자번호 기준으로 저장해 두고 거래처와 다시 맞춘다 ---- */
    if (action === 'import_wehago') {
      const rows = (Array.isArray(body.rows) ? body.rows.slice(0, 6000) : [])
        .filter((r) => r && r.company_name && normBiz(r.business_number).length === 10);
      if (!rows.length) return errJson('읽을 행이 없습니다');
      const now = kst();
      const stmts = rows.map((r) => db.prepare(
        `INSERT INTO bk_wehago (business_number, name, ceo_name, staff_name, birth6, closed, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(business_number) DO UPDATE SET name = excluded.name, ceo_name = excluded.ceo_name,
           staff_name = excluded.staff_name, birth6 = excluded.birth6, closed = excluded.closed, updated_at = excluded.updated_at`
      ).bind(String(r.business_number).trim(), String(r.company_name).trim().slice(0, 80),
             String(r.ceo_name || '').trim().slice(0, 40) || null, String(r.staff_name || '').trim().slice(0, 40) || null,
             /^\d{6}$/.test(String(r.birth6 || '')) ? String(r.birth6) : null,
             (r.closed || /폐업|\[x\]|\[out\]/i.test(String(r.company_name))) ? 1 : 0, now));
      await runBatch(db, stmts);
      const link = await relink(db);
      await logAudit(db, { actor, action: 'bk_wehago_import', entity_type: 'bk_client', entity_id: null,
        after: { rows: rows.length, matched: link.matched, linked: link.linked, source_file: body.source_file || null }, request: context.request });
      const anyClient = await db.prepare(`SELECT 1 AS x FROM bk_clients WHERE ${NOT_DELETED} LIMIT 1`).first();
      return Response.json({ ok: true, rows: rows.length, matched: link.matched, business_linked: link.linked,
                             members_pending: !anyClient,
                             unmatched: link.unmatched.slice(0, 60).map((x) => x.name), unmatched_count: link.unmatched.length });
    }

    /* ---- 통장 거래내역 (직접이체 거래처) — 금액 + 입금자명(상호·대표자·결제자명) ---- */
    if (action === 'import_bank') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
      if (!rows.length) return errJson('읽을 행이 없습니다');
      const { results: cl } = await db.prepare(
        `SELECT id, name, ceo_name, payer, wehago_name, bill FROM bk_clients WHERE ${NOT_DELETED} AND bill > 0`
      ).all();
      const cands = (cl || []).map((c) => ({
        id: c.id, bill: c.bill,
        keys: [...nameKeys(c.name), ...nameKeys(c.wehago_name), normName(c.ceo_name), normName(c.payer)].filter((k) => k && k.length >= 2),
      }));
      const items = [];
      for (const r of rows) {
        const amt = money(r.amount);
        if (amt <= 0) continue;
        const txDate = normYmd(r.tx_date);
        if (!txDate) continue;
        const payer = String(r.payer || '').trim();
        if (/집금/.test(payer)) continue;                 /* CMS 합산 입금 — CMS 파일로 처리 */
        const np = normName(payer);
        const hit = np.length >= 2 ? cands.filter((c) => c.bill === amt && c.keys.some((k) => np.includes(k) || k.includes(np))) : [];
        items.push({ amt, txDate, payer, memo: String(r.memo || '').trim(), cid: hit.length === 1 ? hit[0].id : null, period: null });
      }
      /* 어느 달 기장료인가 — 그 거래처가 기장 중이었고 아직 안 받은 가장 이른 달 (입금월 이하, 최근 24개월).
         없으면 입금월 (선납). 예: 10월분을 11/5 에 이체 → 10월. */
      const cids = [...new Set(items.filter((x) => x.cid).map((x) => x.cid))];
      const openBy = {};
      for (let i = 0; i < cids.length; i += 90) {
        const part = cids.slice(i, i + 90), ph = part.map(() => '?').join(',');
        const [{ results: cs }, { results: paid }, { results: evs }] = await Promise.all([
          db.prepare(`SELECT id, bk_start, bk_end FROM bk_clients WHERE id IN (${ph})`).bind(...part).all(),
          db.prepare(`SELECT client_id, period FROM bk_ledger WHERE paid_at IS NOT NULL AND client_id IN (${ph})`).bind(...part).all(),
          db.prepare(`SELECT client_id, event_date, kind FROM bk_client_events WHERE client_id IN (${ph}) ORDER BY event_date, id`).bind(...part).all(),
        ]);
        const paidSet = new Set((paid || []).map((x) => x.client_id + '|' + x.period));
        const evBy = {};
        for (const e of evs || []) (evBy[e.client_id] ||= []).push(e);
        const t = today(), endY = +t.slice(0, 4), endM = +t.slice(5, 7);
        for (const c of cs || []) {
          const list = [];
          for (let k = 24; k >= 0; k--) {
            let y = endY, m = endM - k; while (m < 1) { m += 12; y--; }
            const per = ym(y, m);
            if (activeIn(per, c, evBy[c.id] || []) && !paidSet.has(c.id + '|' + per)) list.push(per);
          }
          openBy[c.id] = list;
        }
      }
      for (const it of items.sort((x, y) => x.txDate.localeCompare(y.txDate))) {
        if (!it.cid) continue;
        const list = openBy[it.cid] || [];
        const i = list.findIndex((p) => p <= it.txDate.substring(0, 7));
        it.period = i >= 0 ? list.splice(i, 1)[0] : it.txDate.substring(0, 7);
      }
      const now = kst();
      const insRes = await runBatch(db, items.map((it) => db.prepare(
        `INSERT OR IGNORE INTO bk_bank_tx (tx_date, amount, payer, memo, client_id, period, matched_by, source_file, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
      ).bind(it.txDate, it.amt, it.payer, it.memo, it.cid, it.period, it.cid ? '금액+입금자명' : null, body.source_file || null, now)));
      let saved = 0, matched = 0;
      const review = [], led = [];
      items.forEach((it, i) => {
        if (!didChange(insRes[i])) return;
        saved++;
        if (it.cid && it.period) {
          led.push(db.prepare(
            `INSERT INTO bk_ledger (client_id, period, amount, paid_at, source, source_ref, created_at, updated_at)
             VALUES (?1,?2,?3,?4,'통장',?5,?6,?6)
             ON CONFLICT(client_id, period) DO UPDATE SET
               paid_at = COALESCE(bk_ledger.paid_at, excluded.paid_at), source = COALESCE(bk_ledger.source, excluded.source),
               source_ref = COALESCE(bk_ledger.source_ref, excluded.source_ref), updated_at = excluded.updated_at`
          ).bind(it.cid, it.period, it.amt, it.txDate, it.payer + '@' + it.txDate, now));
          matched++;
        } else review.push({ tx_date: it.txDate, amount: it.amt, payer: it.payer });
      });
      await runBatch(db, led);
      return Response.json({ ok: true, saved, matched, review: review.slice(0, 200) });
    }

    /* ---- 기장료 마스터 (선택) — 이체 거래처를 한꺼번에 넣을 때. 기장료 칸 = 공급가 (×1.1 = 청구액) ----
       CMS 회원번호가 있으면 그 회원 거래처를, 없으면 사업자번호·이름이 같은 거래처를 고친다. 없으면 새 수기 거래처. */
    if (action === 'import_master') {
      const mode = url.searchParams.get('mode') === 'commit' ? 'commit' : 'preview';
      const rows = (Array.isArray(body.rows) ? body.rows.slice(0, 3000) : []).map((r) => ({
        company_name: String(r.company_name || '').trim(), ceo_name: String(r.ceo_name || '').trim(),
        business_number: String(r.business_number || '').trim(), bill: Math.round(money(r.monthly_fee) * 1.1),
        member_no: String(r.cms_member_no || '').trim().toUpperCase(), pay_method: String(r.pay_method || '').trim(),
        staff_name: String(r.staff_name || '').trim(), bk_start: normYm(r.bk_start),
      })).filter((r) => r.company_name && r.bill > 0);
      if (!rows.length) return errJson('읽을 행이 없습니다');
      const { results: cl } = await db.prepare(`SELECT id, member_no, name, business_number FROM bk_clients WHERE ${NOT_DELETED}`).all();
      const byNo = {}, byBn = {}, byName = {};
      for (const c of cl || []) {
        if (c.member_no) byNo[c.member_no] = c;
        const bn = normBiz(c.business_number); if (bn.length === 10) (byBn[bn] ||= []).push(c);
        (byName[normLoose(c.name)] ||= []).push(c);
      }
      const plan = rows.map((r) => {
        const bn = normBiz(r.business_number);
        const hit = (r.member_no && byNo[r.member_no]) || (bn.length === 10 && (byBn[bn] || []).length === 1 && byBn[bn][0])
          || ((byName[normLoose(r.company_name)] || []).length === 1 && byName[normLoose(r.company_name)][0]) || null;
        return { ...r, client_id: hit ? hit.id : null };
      });
      if (mode === 'preview') {
        return Response.json({ ok: true, mode, update_count: plan.filter((p) => p.client_id).length,
                               new_count: plan.filter((p) => !p.client_id).length, rows: plan.slice(0, 500) });
      }
      const now = kst();
      const stmts = plan.map((p) => p.client_id
        ? db.prepare(`UPDATE bk_clients SET bill = ?1, staff_name = COALESCE(NULLIF(?2,''), staff_name),
                        business_number = COALESCE(business_number, NULLIF(?3,'')), ceo_name = COALESCE(ceo_name, NULLIF(?4,'')),
                        bk_start = COALESCE(bk_start, ?5), updated_at = ?6 WHERE id = ?7`)
            .bind(p.bill, p.staff_name, p.business_number, p.ceo_name, p.bk_start, now, p.client_id)
        : db.prepare(`INSERT INTO bk_clients (name, ceo_name, business_number, bill, pay_method, staff_name, bk_start, source, created_at, updated_at)
                      VALUES (?1,?2,?3,?4,?5,?6,?7,'manual',?8,?8)`)
            .bind(p.company_name, p.ceo_name || null, p.business_number || null, p.bill, p.pay_method || '직접이체',
                  p.staff_name || null, p.bk_start || today().substring(0, 7), now));
      await runBatch(db, stmts);
      const link = await relink(db);
      await logAudit(db, { actor, action: 'bk_master_import', entity_type: 'bk_client', entity_id: null,
        after: { rows: plan.length, source_file: body.source_file || null }, request: context.request });
      return Response.json({ ok: true, mode, updated: plan.filter((p) => p.client_id).length,
                             added: plan.filter((p) => !p.client_id).length, business_linked: link.linked });
    }

    /* ---- 국세청 사업자등록상태 (휴·폐업) — 사업자번호가 있는 거래처 (위하고 명부로 채워짐) ---- */
    if (action === 'check_biz_status') {
      const key = ntsServiceKey(context.env.NTS_API_KEY);
      if (!key) return errJson('국세청 조회 키(NTS_API_KEY)가 아직 설정되지 않았습니다 — Cloudflare 대시보드에서 넣어 주세요');
      const limit = Math.min(Number(body.limit) || 100, 100);
      const { results } = await db.prepare(
        `SELECT id, name, business_number, nts_status FROM bk_clients
          WHERE ${NOT_DELETED} AND business_number IS NOT NULL AND business_number != '' AND bill > 0
          ORDER BY COALESCE(nts_checked_at, '') ASC LIMIT ?1`
      ).bind(limit).all();
      const list = (results || []).filter((b) => normBiz(b.business_number).length === 10);
      if (!list.length) return Response.json({ ok: true, checked: 0, changed: [] });
      const res = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b_no: list.map((b) => normBiz(b.business_number)) }),
      });
      if (res.status === 401 || res.status === 403) return errJson('국세청 조회 키가 맞지 않습니다 — 활용신청 직후면 승인 반영까지 몇 시간 걸릴 수 있습니다', 502);
      if (!res.ok) return errJson('국세청 조회가 실패했습니다 (' + res.status + ')', 502);
      const data = await res.json();
      const byNo = {};
      for (const d of data.data || []) byNo[String(d.b_no)] = d;
      const changed = [], writes = [], now = kst();
      for (const b of list) {
        const d = byNo[normBiz(b.business_number)];
        if (!d) continue;
        const st = d.b_stt || (d.tax_type && d.tax_type.includes('등록되지') ? '미등록' : '');
        if (st && st !== b.nts_status) changed.push({ client_id: b.id, name: b.name, before: b.nts_status || '', after: st, end_date: d.end_dt || '' });
        writes.push(db.prepare(`UPDATE bk_clients SET nts_status = ?1, nts_checked_at = ?2 WHERE id = ?3`).bind(st || null, now, b.id));
      }
      /* 폐업자는 '폐업확인' 기록만 (기장 종료는 사람이 확인 후 — 이 기록은 구간을 안 움직임) */
      for (const c of changed) {
        if (c.after !== '폐업자') continue;
        const ed = /^\d{8}$/.test(c.end_date) ? `${c.end_date.slice(0, 4)}-${c.end_date.slice(4, 6)}-${c.end_date.slice(6, 8)}` : today();
        writes.push(db.prepare(`INSERT INTO bk_client_events (client_id, event_date, kind, memo, created_at) VALUES (?1,?2,'폐업확인',?3,?4)`)
          .bind(c.client_id, ed, '국세청 조회 자동 감지 — 기장 종료 처리는 확인 후 수동', now));
      }
      await runBatch(db, writes);
      return Response.json({ ok: true, checked: list.length, changed });
    }

    return errJson('unknown_action');
  } catch (e) {
    console.error('[admin-bk-fees POST]', action, e);
    return errJson('처리 중 오류가 발생했습니다. 다시 시도해 주세요', 500);
  }
}
