// 기장료 수납 관리 — 거래처 월 기장료 청구·수납 원장 + 생애주기 이벤트
//
// 사장님 요구 (2026-11-12):
//   "거래처 깔아놓고 입금 됐다 안 됐다만 확인. 통장 거래내역이랑 CMS 입금내역이랑."
//   "기장이 들어왔다, 언제 들어왔다, 이거 안됐다, 폐업됐다, 이것도 체크할 수 있도록."
//   권한: 직원 전체 (사장님 답, 2026-11-12). 화면 = 옛 admin 독립 페이지 bk-fees.html (새 admin 동결).
//
// 설계 원칙:
//   - businesses 테이블 재사용(중복 구현 금지 룰). 기장료 관련 컬럼만 lazy ALTER 추가.
//   - billing_invoices(조정료 청구서)와 별개. 이쪽은 "월 기장료" 전용.
//   - 격자 칸은 계약 구간(bk_start~bk_end) 안이고, 중단·해지·폐업 ~ 재개 사이가 아닐 때만 ○/✕.
//
// Endpoints (전부 ?key=ADMIN_KEY 또는 admin 세션):
//   GET  ?action=grid&year=2026            → 거래처 × 월 격자
//   GET  ?action=contracts                 → 기장료 계약 목록(마스터)
//   POST ?action=save_contract             { business_id, monthly_fee, cms_member_no, pay_method, staff_name, bk_start, bk_end, bk_end_reason }
//   POST ?action=event                     { business_id, kind, event_date, memo }  kind: 수임|재개|중단|해지|폐업|담당변경
//   POST ?action=mark_paid                 { business_id, period, paid_at, amount, memo }  (수기 입금확인)
//   POST ?action=unmark_paid               { business_id, period }
//   POST ?action=import_cms                { rows:[{member_no,member_name,tx_date,amount,status,reason,method}], source_file }
//   POST ?action=import_bank               { rows:[{tx_date,amount,payer,memo}], source_file }
//   POST ?action=import_master&mode=preview|commit  { rows:[...], source_file }
//   POST ?action=check_biz_status          { limit }  → 국세청 사업자등록상태 조회(휴·폐업 자동 체크)
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
function ym(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }
/** '2024-03' / '2024.3' / '2024-03-01' / '202403' → '2024-03' (아니면 null) */
export function normYm(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})\D+(\d{1,2})(?:\D|$)/) || t.match(/^(\d{4})(\d{2})(?:\d{2})?$/);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return ym(m[1], mo);
}
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const NOT_DELETED = `(deleted_at IS NULL OR deleted_at = '')`;
export const EVENT_KINDS = ['수임', '재개', '중단', '해지', '폐업', '담당변경'];
const START_KINDS = ['수임', '재개'];
const STOP_KINDS = ['중단', '해지', '폐업'];

/* ---------- lazy migration ---------- */
const BK_COLS = [
  ['monthly_fee', 'INTEGER'],          // 월 기장료(공급가)
  ['cms_member_no', 'TEXT'],           // 세무사CMS 회원번호 (M0000123)
  ['pay_method', 'TEXT'],              // CMS계좌 | CMS카드 | 직접이체 | 현금
  ['staff_name', 'TEXT'],              // 담당 직원
  ['bk_start', 'TEXT'],                // 기장 시작 YYYY-MM
  ['bk_end', 'TEXT'],                  // 기장 종료 YYYY-MM (NULL = 진행중)
  ['bk_end_reason', 'TEXT'],           // 폐업 | 해지 | 중단 | 신고대리전환 | 담당자변경
  ['nts_status', 'TEXT'],              // 국세청 조회 결과 원문: 계속사업자 | 휴업자 | 폐업자
  ['nts_checked_at', 'TEXT'],
];

async function ensureSchema(db) {
  for (const [col, type] of BK_COLS) {
    try { await db.prepare(`ALTER TABLE businesses ADD COLUMN ${col} ${type}`).run(); } catch {}
  }
  try { await db.prepare(`ALTER TABLE businesses ADD COLUMN updated_at TEXT`).run(); } catch {}
  // 월 기장료 청구·수납 원장 — 한 줄 = 거래처 × 귀속월 하나
  await db.prepare(`CREATE TABLE IF NOT EXISTS bk_fee_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    amount INTEGER,
    paid_at TEXT,
    source TEXT,
    source_ref TEXT,
    memo TEXT,
    confirmed_by_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(business_id, period)
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_bkfee_period ON bk_fee_ledger(period)`).run(); } catch {}

  // 거래처 생애주기 이벤트
  await db.prepare(`CREATE TABLE IF NOT EXISTS bk_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    event_date TEXT NOT NULL,
    kind TEXT NOT NULL,
    memo TEXT,
    created_by_id INTEGER,
    created_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_bkev_biz ON bk_events(business_id, event_date DESC)`).run(); } catch {}

  // CMS 출금결과 원본 (재업로드해도 중복 안 쌓이게 UNIQUE)
  await db.prepare(`CREATE TABLE IF NOT EXISTS bk_cms_tx (
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
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_bkcms_period ON bk_cms_tx(period)`).run(); } catch {}

  // 통장 입금내역 원본
  await db.prepare(`CREATE TABLE IF NOT EXISTS bk_bank_tx (
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
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_bkbank_date ON bk_bank_tx(tx_date)`).run(); } catch {}
}

/* CMS 출금일 → 귀속월
 * 1차 출금은 25~28일, 실패분 재출금은 다음달 1~10일에 흩어진다.
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
const CMS_OK = ['출금성공', '재출금성공', '승인성공'];

/** 지금(KST) 기준 그 해의 마감된 마지막 달. CMS 출금일이 25~26일이라 27일 전이면 이번 달은 아직 미도래. */
export function lastClosedMonth(year, now = new Date(Date.now() + 9 * 3600 * 1000)) {
  const curY = now.getUTCFullYear(), curM = now.getUTCMonth() + 1, curD = now.getUTCDate();
  if (year < curY) return 12;
  if (year > curY) return 0;
  return curD >= 27 ? curM : curM - 1;
}

/** 그 달에 기장 중이었나 — 계약 구간 안 + (중단·해지·폐업 ~ 재개·수임) 사이가 아님.
 *  중단 이벤트가 있는 달은 그 달까지 청구(bk_end 와 같은 규칙), 재개 이벤트가 있는 달부터 다시 청구. */
export function activeIn(period, b, events) {
  if (b.bk_start && period < b.bk_start) return false;
  if (b.bk_end && period > b.bk_end) return false;
  let active = true;
  for (const e of events || []) {                     /* event_date 오름차순 */
    const em = String(e.event_date || '').substring(0, 7);
    if (STOP_KINDS.includes(e.kind) && em < period) active = false;
    else if (START_KINDS.includes(e.kind) && em <= period) active = true;
  }
  return active;
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

    if (action === 'contracts') {
      const { results } = await db.prepare(
        `SELECT id, company_name, ceo_name, business_number, monthly_fee, cms_member_no,
                pay_method, staff_name, bk_start, bk_end, bk_end_reason, nts_status, nts_checked_at
           FROM businesses
          WHERE ${NOT_DELETED} AND (monthly_fee IS NOT NULL OR cms_member_no IS NOT NULL OR bk_start IS NOT NULL)
          ORDER BY staff_name, company_name`
      ).all();
      return Response.json({ ok: true, contracts: results || [] });
    }

    if (action === 'grid') {
      const { results: biz } = await db.prepare(
        `SELECT id, company_name, ceo_name, business_number, monthly_fee, cms_member_no,
                pay_method, staff_name, bk_start, bk_end, bk_end_reason, nts_status
           FROM businesses
          WHERE ${NOT_DELETED} AND monthly_fee IS NOT NULL AND monthly_fee > 0
          ORDER BY staff_name, company_name`
      ).all();
      const { results: led } = await db.prepare(
        `SELECT business_id, period, amount, paid_at, source, memo
           FROM bk_fee_ledger WHERE period LIKE ?1`
      ).bind(`${year}-%`).all();
      const { results: evs } = await db.prepare(
        `SELECT business_id, event_date, kind, memo FROM bk_events ORDER BY event_date, id`
      ).all();

      const byBiz = {};
      for (const r of (led || [])) (byBiz[r.business_id] ||= {})[r.period] = r;
      const evBy = {};
      for (const e of (evs || [])) (evBy[e.business_id] ||= []).push(e);

      const lastClosed = lastClosedMonth(year);
      const rows = (biz || []).map(b => {
        const bill = Math.round((b.monthly_fee || 0) * 1.1);
        const events = evBy[b.id] || [];
        const cells = [];
        for (let m = 1; m <= 12; m++) {
          const p = ym(year, m);
          const rec = byBiz[b.id]?.[p];
          /* 입금 기록이 있으면 구간 밖이어도 보여준다 (기록을 숨기지 않음) */
          if (rec && rec.paid_at) { cells.push({ s: 'o', d: rec.paid_at, a: rec.amount || bill, src: rec.source || '' }); continue; }
          if (!activeIn(p, b, events)) { cells.push({ s: '-' }); continue; }
          if (m > lastClosed) { cells.push({ s: '-', future: true }); continue; }
          cells.push({ s: 'x', a: (rec && rec.amount) || bill, p });
        }
        return {
          id: b.id, name: b.company_name, ceo: b.ceo_name, biz_no: b.business_number,
          staff: b.staff_name || '', fee: bill, cms: b.cms_member_no || '', pay: b.pay_method || '',
          start: b.bk_start || '', end: b.bk_end || '', end_reason: b.bk_end_reason || '',
          nts: b.nts_status || '', events, cells,
        };
      });
      const openAmt = rows.reduce((a, r) => a + r.cells.filter(c => c.s === 'x').reduce((s, c) => s + (c.a || 0), 0), 0);
      return Response.json({
        ok: true, year, lastClosed, rows,
        total: {
          biz: rows.length,
          openAmt,
          openBiz: rows.filter(r => r.cells.some(c => c.s === 'x')).length,
        },
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
  /* Phase 14 패턴 — CSRF Origin/Referer 가드 */
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
    logAudit(db, { actor, action: act, entity_type: 'business', entity_id, after, request: context.request });

  try {
    await ensureSchema(db);

    /* ---- 기장료 계약 저장 ---- */
    if (action === 'save_contract') {
      const business_id = Number(body.business_id);
      if (!business_id) return errJson('business_id 가 필요합니다');
      const sets = [], vals = [], after = {};
      const put = (k, v) => { sets.push(`${k} = ?`); vals.push(v); after[k] = v; };
      if ('monthly_fee' in body) {
        const n = body.monthly_fee === '' || body.monthly_fee == null ? null : Number(body.monthly_fee);
        if (n !== null && (!Number.isFinite(n) || n < 0)) return errJson('기장료는 숫자로 적어 주세요');
        put('monthly_fee', n === null ? null : Math.round(n));
      }
      for (const k of ['cms_member_no', 'pay_method', 'staff_name', 'bk_end_reason']) {
        if (k in body) put(k, body[k] === '' || body[k] == null ? null : String(body[k]).trim().slice(0, 60));
      }
      for (const k of ['bk_start', 'bk_end']) {
        if (!(k in body)) continue;
        if (body[k] === '' || body[k] == null) { put(k, null); continue; }
        const v = normYm(body[k]);
        if (!v) return errJson('기장 시작·종료는 YYYY-MM 으로 적어 주세요');
        put(k, v);
      }
      if (!sets.length) return errJson('바꿀 내용이 없습니다');
      sets.push('updated_at = ?'); vals.push(kst());
      vals.push(business_id);
      await db.prepare(`UPDATE businesses SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
      await audit('bk_contract_save', business_id, after);
      return Response.json({ ok: true });
    }

    /* ---- 생애주기 이벤트 (수임/재개/중단/해지/폐업/담당변경) ---- */
    if (action === 'event') {
      const business_id = Number(body.business_id);
      const kind = String(body.kind || '');
      if (!business_id || !EVENT_KINDS.includes(kind)) return errJson('거래처와 구분(수임·재개·중단·해지·폐업·담당변경)이 필요합니다');
      const d = body.event_date ? String(body.event_date) : today();
      if (!isYmd(d)) return errJson('날짜는 YYYY-MM-DD 로 적어 주세요');
      const p = d.substring(0, 7);
      const memo = body.memo ? String(body.memo).slice(0, 300) : null;
      await db.prepare(
        `INSERT INTO bk_events (business_id, event_date, kind, memo, created_by_id, created_at)
         VALUES (?1,?2,?3,?4,?5,?6)`
      ).bind(business_id, d, kind, memo, uid, kst()).run();

      /* 이벤트가 계약 구간을 움직인다.
         재개·수임은 시작월을 덮어쓰지 않는다 (덮어쓰면 그 전 입금 이력이 격자에서 사라짐) —
         중단~재개 사이는 격자가 이벤트로 '-' 처리한다. 시작월이 없거나 더 늦을 때만 당긴다. */
      if (START_KINDS.includes(kind)) {
        await db.prepare(
          `UPDATE businesses SET bk_start = CASE WHEN bk_start IS NULL OR bk_start = '' OR bk_start > ?1 THEN ?1 ELSE bk_start END,
                  bk_end = NULL, bk_end_reason = NULL, updated_at = ?2 WHERE id = ?3`
        ).bind(p, kst(), business_id).run();
      } else if (STOP_KINDS.includes(kind)) {
        await db.prepare(`UPDATE businesses SET bk_end = ?1, bk_end_reason = ?2, updated_at = ?3 WHERE id = ?4`)
          .bind(p, kind, kst(), business_id).run();
      }
      await audit('bk_event', business_id, { kind, event_date: d, memo });
      return Response.json({ ok: true });
    }

    /* ---- 수기 입금확인 / 해제 ---- */
    if (action === 'mark_paid' || action === 'unmark_paid') {
      const business_id = Number(body.business_id);
      const period = normYm(body.period);
      if (!business_id || !period) return errJson('거래처와 귀속월(YYYY-MM)이 필요합니다');
      if (action === 'unmark_paid') {
        await db.prepare(`UPDATE bk_fee_ledger SET paid_at = NULL, source = NULL, source_ref = NULL, updated_at = ?1
                           WHERE business_id = ?2 AND period = ?3`).bind(kst(), business_id, period).run();
        await audit('bk_unmark_paid', business_id, { period });
        return Response.json({ ok: true });
      }
      const paidAt = body.paid_at ? String(body.paid_at) : today();
      if (!isYmd(paidAt)) return errJson('입금일은 YYYY-MM-DD 로 적어 주세요');
      const b = await db.prepare(`SELECT monthly_fee FROM businesses WHERE id = ?1`).bind(business_id).first();
      const given = Number(body.amount);
      const amt = Number.isFinite(given) && given > 0 ? Math.round(given) : Math.round((b?.monthly_fee || 0) * 1.1);
      const memo = body.memo ? String(body.memo).slice(0, 300) : null;
      await db.prepare(
        `INSERT INTO bk_fee_ledger (business_id, period, amount, paid_at, source, memo, confirmed_by_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,'수기',?5,?6,?7,?7)
         ON CONFLICT(business_id, period) DO UPDATE SET
           paid_at = excluded.paid_at, source = excluded.source, memo = excluded.memo,
           amount = COALESCE(bk_fee_ledger.amount, excluded.amount),
           confirmed_by_id = excluded.confirmed_by_id, updated_at = excluded.updated_at`
      ).bind(business_id, period, amt, paidAt, memo, uid, kst()).run();
      await audit('bk_mark_paid', business_id, { period, amount: amt, paid_at: paidAt });
      return Response.json({ ok: true });
    }

    /* ---- CMS 출금결과 업로드 ---- */
    if (action === 'import_cms') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
      if (!rows.length) return errJson('읽을 행이 없습니다');
      const { results: biz } = await db.prepare(
        `SELECT id, cms_member_no FROM businesses WHERE ${NOT_DELETED} AND cms_member_no IS NOT NULL AND cms_member_no != ''`
      ).all();
      const byCms = {};
      for (const b of (biz || [])) byCms[String(b.cms_member_no).trim()] = b.id;

      let saved = 0, dup = 0, paid = 0;
      const unknown = new Set();
      for (const r of rows) {
        const no = String(r.member_no || '').trim();
        if (!no) continue;
        const bid = byCms[no] || null;
        if (!bid) unknown.add(no + ' / ' + (r.member_name || ''));
        const p = cmsPeriod(r.tx_date);
        const amount = Math.round(Number(String(r.amount ?? '').replace(/[^\d.-]/g, ''))) || 0;
        const status = String(r.status || '').trim();
        const ins = await db.prepare(
          `INSERT OR IGNORE INTO bk_cms_tx (member_no, member_name, tx_date, amount, status, reason, method,
                                            business_id, period, source_file, created_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
        ).bind(no, r.member_name || null, String(r.tx_date || ''), amount,
               status, r.reason || '', r.method || 'CMS계좌',
               bid, p, body.source_file || null, kst()).run();
        if (ins?.meta?.changes) saved++; else dup++;
        // 성공 건은 원장에 수납으로 반영 (이미 입금 표시된 달은 그대로)
        if (bid && p && CMS_OK.includes(status)) {
          const d = String(r.tx_date).replace(/\D/g, '');
          const paidAt = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
          await db.prepare(
            `INSERT INTO bk_fee_ledger (business_id, period, amount, paid_at, source, source_ref, created_at, updated_at)
             VALUES (?1,?2,?3,?4,'CMS',?5,?6,?6)
             ON CONFLICT(business_id, period) DO UPDATE SET
               paid_at = COALESCE(bk_fee_ledger.paid_at, excluded.paid_at),
               source = COALESCE(bk_fee_ledger.source, excluded.source),
               source_ref = COALESCE(bk_fee_ledger.source_ref, excluded.source_ref),
               updated_at = excluded.updated_at`
          ).bind(bid, p, amount, paidAt, no + '@' + r.tx_date, kst()).run();
          paid++;
        }
      }
      return Response.json({ ok: true, saved, duplicate: dup, paid, unknown_members: [...unknown].slice(0, 100) });
    }

    /* ---- 통장 거래내역 업로드 (금액 + 입금자명으로 후보 매칭) ---- */
    if (action === 'import_bank') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
      if (!rows.length) return errJson('읽을 행이 없습니다');
      const { results: biz } = await db.prepare(
        `SELECT id, company_name, ceo_name, monthly_fee FROM businesses
          WHERE ${NOT_DELETED} AND monthly_fee IS NOT NULL AND monthly_fee > 0`
      ).all();
      const cands = (biz || []).map(b => ({
        id: b.id, bill: Math.round((b.monthly_fee || 0) * 1.1),
        keys: [normName(b.company_name), normName(b.ceo_name)].filter(k => k.length >= 2),
      }));

      let saved = 0, matched = 0;
      const review = [];
      for (const r of rows) {
        const amt = Math.round(Number(String(r.amount ?? '').replace(/[^\d.-]/g, ''))) || 0;
        if (amt <= 0) continue;                       // 입금만 본다
        const d = String(r.tx_date || '').replace(/\D/g, '').slice(0, 8);
        if (d.length !== 8) continue;
        const txDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        const payer = String(r.payer || '').trim();
        /* CMS·카드 집금은 여러 거래처가 합산된 한 줄 — 거래처를 가릴 수 없다 (CMS 파일로 처리) */
        if (/집금/.test(payer)) continue;
        const np = normName(payer);
        /* 입금자명이 2글자 미만이면 금액만으로 붙어 버리므로 자동 매칭 안 함 (사람이 확인) */
        const hit = np.length >= 2
          ? cands.filter(c => c.bill === amt && c.keys.some(k => np.includes(k) || k.includes(np)))
          : [];
        const bid = hit.length === 1 ? hit[0].id : null;
        // 미납 상태인 가장 오래된 월에 붙인다
        let period = null;
        if (bid) {
          const open = await db.prepare(
            `SELECT period FROM bk_fee_ledger WHERE business_id = ?1 AND paid_at IS NULL AND period <= ?2 ORDER BY period LIMIT 1`
          ).bind(bid, txDate.substring(0, 7)).first();
          period = open?.period || txDate.substring(0, 7);
        }
        /* memo 는 NULL 대신 '' — UNIQUE 에서 NULL 은 서로 다른 값이라 같은 파일을 다시 올리면 중복으로 쌓인다 */
        const ins = await db.prepare(
          `INSERT OR IGNORE INTO bk_bank_tx (tx_date, amount, payer, memo, business_id, period, matched_by, source_file, created_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
        ).bind(txDate, amt, payer, String(r.memo || '').trim(), bid, period,
               bid ? '금액+입금자명' : null, body.source_file || null, kst()).run();
        if (!ins?.meta?.changes) continue;            // 이미 올린 거래 — 다시 붙이지 않음
        saved++;
        if (bid && period) {
          await db.prepare(
            `INSERT INTO bk_fee_ledger (business_id, period, amount, paid_at, source, source_ref, created_at, updated_at)
             VALUES (?1,?2,?3,?4,'통장',?5,?6,?6)
             ON CONFLICT(business_id, period) DO UPDATE SET
               paid_at = COALESCE(bk_fee_ledger.paid_at, excluded.paid_at),
               source = COALESCE(bk_fee_ledger.source, excluded.source),
               source_ref = COALESCE(bk_fee_ledger.source_ref, excluded.source_ref),
               updated_at = excluded.updated_at`
          ).bind(bid, period, amt, txDate, payer + '@' + txDate, kst()).run();
          matched++;
        } else {
          review.push({ tx_date: txDate, amount: amt, payer });
        }
      }
      return Response.json({ ok: true, saved, matched, review: review.slice(0, 200) });
    }

    /* ---- 기장료 마스터 일괄 등록 (preview → commit) ----
       rows: [{ company_name, ceo_name, business_number, monthly_fee, cms_member_no, pay_method, staff_name, bk_start }]
       businesses 에 이미 있는 거래처만 UPDATE, 없으면 미매칭으로 보고만 하고 INSERT 안 함(중복 생성 방지). */
    if (action === 'import_master') {
      const mode = url.searchParams.get('mode') === 'commit' ? 'commit' : 'preview';
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 3000) : [];
      if (!rows.length) return errJson('읽을 행이 없습니다');
      const { results: biz } = await db.prepare(
        `SELECT id, company_name, ceo_name, business_number FROM businesses WHERE ${NOT_DELETED}`
      ).all();
      const byBizNo = {}, byName = {};
      for (const b of (biz || [])) {
        const bn = normBiz(b.business_number);
        if (bn.length === 10) byBizNo[bn] = b;
        (byName[normName(b.company_name)] ||= []).push(b);
      }
      const matched = [], unmatched = [], ambiguous = [];
      for (const r0 of rows) {
        const r = {
          company_name: String(r0.company_name || '').trim(), ceo_name: String(r0.ceo_name || '').trim(),
          business_number: String(r0.business_number || '').trim(),
          monthly_fee: Math.round(Number(String(r0.monthly_fee ?? '').replace(/[^\d.]/g, ''))) || 0,
          cms_member_no: String(r0.cms_member_no || '').trim(), pay_method: String(r0.pay_method || '').trim(),
          staff_name: String(r0.staff_name || '').trim(), bk_start: normYm(r0.bk_start),
        };
        if (!r.company_name || r.monthly_fee <= 0) continue;
        const bn = normBiz(r.business_number);
        let hit = (bn.length === 10 && byBizNo[bn]) || null;
        let how = hit ? '사업자번호' : '';
        if (!hit) {
          const c = byName[normName(r.company_name)] || [];
          if (c.length === 1) { hit = c[0]; how = '상호'; }
          else if (c.length > 1) {
            const c2 = c.filter(x => normName(x.ceo_name) === normName(r.ceo_name));
            if (c2.length === 1) { hit = c2[0]; how = '상호+대표자'; }
            else { ambiguous.push({ ...r, candidates: c.map(x => ({ id: x.id, name: x.company_name, ceo: x.ceo_name })) }); continue; }
          }
        }
        if (hit) matched.push({ business_id: hit.id, db_name: hit.company_name, how, ...r });
        else unmatched.push(r);
      }
      if (mode === 'preview') {
        return Response.json({
          ok: true, mode, matched_count: matched.length, unmatched_count: unmatched.length,
          ambiguous_count: ambiguous.length,
          matched: matched.slice(0, 500), unmatched, ambiguous,
        });
      }
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      const lastClosed = lastClosedMonth(year);
      let updated = 0, seeded = 0;
      for (const m of matched) {
        await db.prepare(
          `UPDATE businesses SET monthly_fee = ?1, cms_member_no = ?2, pay_method = ?3,
                  staff_name = ?4, bk_start = COALESCE(?5, bk_start), updated_at = ?6
            WHERE id = ?7`
        ).bind(m.monthly_fee, m.cms_member_no || null, m.pay_method || null,
               m.staff_name || null, m.bk_start || null, kst(), m.business_id).run();
        updated++;
        // 청구 행 생성 — 기장시작~마감월까지, 이미 있으면 건드리지 않음
        const startM = (m.bk_start && m.bk_start.startsWith(String(year))) ? +m.bk_start.slice(5, 7)
          : (m.bk_start && m.bk_start > `${year}-12`) ? 13 : 1;
        const bill = Math.round(m.monthly_fee * 1.1);
        for (let mo = startM; mo <= lastClosed; mo++) {
          const r = await db.prepare(
            `INSERT OR IGNORE INTO bk_fee_ledger (business_id, period, amount, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?4)`
          ).bind(m.business_id, ym(year, mo), bill, kst()).run();
          if (r?.meta?.changes) seeded++;
        }
      }
      await logAudit(db, { actor, action: 'bk_master_import', entity_type: 'business', entity_id: null,
        after: { updated, ledger_rows: seeded, unmatched: unmatched.length, ambiguous: ambiguous.length, source_file: body.source_file || null },
        request: context.request });
      return Response.json({ ok: true, mode, updated, ledger_rows: seeded, unmatched, ambiguous });
    }

    /* ---- 국세청 사업자등록상태 조회 (휴·폐업 자동 체크) ----
       공공데이터포털 "국세청_사업자등록정보 진위확인 및 상태조회" 서비스.
       키는 Cloudflare 대시보드(sewmu-chatbot) 환경변수 NTS_API_KEY — 코드로 우회 금지 룰.
       b_stt 값: "계속사업자" | "휴업자" | "폐업자" (미등록은 빈 값 + tax_type 안내문). */
    if (action === 'check_biz_status') {
      const key = context.env.NTS_API_KEY;
      if (!key) return errJson('국세청 조회 키(NTS_API_KEY)가 아직 설정되지 않았습니다 — Cloudflare 대시보드에서 넣어 주세요');
      const limit = Math.min(Number(body.limit) || 100, 100);   // API 1회 100건 제한
      const { results } = await db.prepare(
        `SELECT id, company_name, business_number, nts_status FROM businesses
          WHERE ${NOT_DELETED} AND business_number IS NOT NULL AND business_number != ''
            AND monthly_fee IS NOT NULL AND monthly_fee > 0
            AND (bk_end IS NULL OR bk_end = '')
          ORDER BY COALESCE(nts_checked_at, '') ASC LIMIT ?1`
      ).bind(limit).all();
      const list = (results || []).filter(b => normBiz(b.business_number).length === 10);
      if (!list.length) return Response.json({ ok: true, checked: 0, changed: [] });

      const res = await fetch(
        `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ b_no: list.map(b => normBiz(b.business_number)) }) }
      );
      if (!res.ok) return errJson('국세청 조회가 실패했습니다 (' + res.status + ')', 502);
      const data = await res.json();
      const byNo = {};
      for (const d of (data.data || [])) byNo[String(d.b_no)] = d;

      const changed = [];
      for (const b of list) {
        const d = byNo[normBiz(b.business_number)];
        if (!d) continue;
        const st = d.b_stt || (d.tax_type && d.tax_type.includes('등록되지') ? '미등록' : '');
        if (st && st !== b.nts_status) {
          changed.push({ business_id: b.id, name: b.company_name, before: b.nts_status || '', after: st,
                         end_date: d.end_dt || '' });
        }
        await db.prepare(`UPDATE businesses SET nts_status = ?1, nts_checked_at = ?2 WHERE id = ?3`)
          .bind(st || null, kst(), b.id).run();
      }
      // 폐업으로 바뀐 곳은 이벤트만 남긴다. 기장 종료 처리는 사람이 확인 후 (이벤트 kind '폐업확인' 은 구간을 안 움직임).
      for (const c of changed) {
        if (c.after === '폐업자') {
          const ed = /^\d{8}$/.test(c.end_date) ? `${c.end_date.slice(0, 4)}-${c.end_date.slice(4, 6)}-${c.end_date.slice(6, 8)}` : today();
          await db.prepare(
            `INSERT INTO bk_events (business_id, event_date, kind, memo, created_at)
             VALUES (?1,?2,'폐업확인',?3,?4)`
          ).bind(c.business_id, ed, '국세청 조회 자동 감지 — 기장 종료 처리는 확인 후 수동', kst()).run();
        }
      }
      return Response.json({ ok: true, checked: list.length, changed });
    }

    return errJson('unknown_action');
  } catch (e) {
    console.error('[admin-bk-fees POST]', action, e);
    return errJson('처리 중 오류가 발생했습니다. 다시 시도해 주세요', 500);
  }
}
