/**
 * 📥 검토표 JSON 심기 (2026-07-17 사장님: "신고서 올리면 니가 하드코딩으로 심고 챗봇이 답변" — 프리미엄 추출 루프)
 *
 * 흐름: 사장님이 신고서를 Claude 채팅에 업로드 → Claude 가 정밀 추출·검수 후 JSON 파일 제공
 *       → admin (위하고 Import 모달) 에서 JSON 업로드 → 미리보기(DB 변경 0) → [확정 심기]
 *       → filings upsert (verified_at 세팅 → 챗봇 즉시 노출. 미확정/미검증은 기존 게이트로 비노출)
 *
 * 원칙:
 *  - 기본은 사장님 수기 입력 절대 우선: 기존 검토표의 채워진 칸은 안 덮고 빈 칸만 보강.
 *  - overwrite:true (사장님이 모달에서 명시적으로 체크) 일 때만 기존 값도 신고서 값으로 교체.
 *    이 경우 미리보기가 '무엇이 무엇으로' 바뀌는지 전부 보여주고, audit 에 before/after 가 남는다.
 *  - owner 매칭: 개인 = users 이름 정확·유일 일치 (또는 user_id 직접 지정),
 *    법인 = businesses 사업자번호 → 없으면 회사명 정확·유일 일치.
 *  - 전부 audit. owner 전용.
 *
 * JSON 형식:
 * { "source_file": "2025 종소세 1차",
 *   "rows": [ { "name": "김영수", "user_id": 12(선택), "biz_no": "123-45-67890"(법인),
 *               "owner_type": "Person"|"Business", "fiscal_year": 2025, "type": "종소세",
 *               "fields": { "revenue": 240000000, "total_income": 90000000, ... } } ] }
 *
 * 부가세는 fields 에 "paid_tax"(납부세액) 와 "vat" 세부를 넣을 수 있다:
 *   "fields": { "revenue": 500000000, "paid_tax": 12000000,
 *               "vat": { "매출세액": 50000000, "매입세액": 38000000 } }
 * vat 은 1단계 객체·숫자값만 통과 (키 20자 이하, 최대 8개) — chat.js 렌더 규칙과 동일.
 *
 * 공제·감면 / 가산세 내역은 배열로 넣는다 (검토표가 합계를 자동 계산, 청구서 Section 3 도 사용):
 *   "fields": { "deductions": [{ "code": "244", "name": "전자신고세액공제", "amount": 20000 }],
 *               "penalties":  [{ "name": "무신고가산세", "amount": 0 }] }
 */

import { checkAdmin, adminUnauthorized, ownerOnly, checkOriginCsrf } from "./_adminAuth.js";
import { logAudit } from "./_audit.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}
function normBiz(s) { return String(s || '').replace(/\D/g, ''); }

const FILING_TYPES = ['종소세', '법인세', '부가세'];
const FIELD_KEYS = [
  'revenue', 'total_income', 'income_deduction', 'tax_base', 'calculated_tax',
  'deduction_total', 'penalty_total', 'decisive_tax', 'prepaid_tax', 'payable_tax', 'paid_tax',
  'farmland_tax', 'net_income', 'adj_inclusion', 'adj_exclusion', 'business_income', 'additional_tax',
];

async function ensureCols(db) {
  /* 스크래핑 phase 에서 추가된 컬럼들 — 미생성 환경 대비 lazy */
  for (const sql of [
    `ALTER TABLE filings ADD COLUMN source TEXT`,
    `ALTER TABLE filings ADD COLUMN verified_at TEXT`,
    `ALTER TABLE filings ADD COLUMN verified_by TEXT`,
  ]) { try { await db.prepare(sql).run(); } catch (_) {} }
  await db.prepare(`CREATE TABLE IF NOT EXISTS filing_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT,
    status TEXT NOT NULL DEFAULT 'preview',
    preview_data TEXT,
    summary TEXT,
    created_at TEXT NOT NULL,
    committed_at TEXT
  )`).run();
}

/* row → owner 매칭. 결과: {ok, owner_type, owner_id, label} | {ok:false, reason, candidates?} */
async function matchOwner(db, row) {
  const name = String(row.name || '').trim();
  if (row.owner_type === 'Business' || (row.type === '법인세')) {
    const bn = normBiz(row.biz_no);
    if (bn) {
      const { results } = await db.prepare(
        `SELECT id, company_name FROM businesses WHERE REPLACE(REPLACE(business_number,'-',''),' ','') = ? AND (deleted_at IS NULL OR deleted_at = '')`
      ).bind(bn).all();
      if ((results || []).length === 1) return { ok: true, owner_type: 'Business', owner_id: results[0].id, label: results[0].company_name };
      if ((results || []).length > 1) return { ok: false, reason: '사업자번호 다중 매칭', candidates: results.map(b => b.company_name + '#' + b.id) };
    }
    if (name) {
      const { results } = await db.prepare(
        `SELECT id, company_name FROM businesses WHERE company_name = ? AND (deleted_at IS NULL OR deleted_at = '')`
      ).bind(name).all();
      if ((results || []).length === 1) return { ok: true, owner_type: 'Business', owner_id: results[0].id, label: results[0].company_name };
      if ((results || []).length > 1) return { ok: false, reason: '회사명 다중 매칭 — biz_no 를 넣어주세요', candidates: results.map(b => b.company_name + '#' + b.id) };
    }
    return { ok: false, reason: '법인 매칭 실패 (사업자번호/회사명 확인)' };
  }
  /* Person */
  if (row.user_id) {
    const u = await db.prepare(`SELECT id, COALESCE(real_name, name) AS n FROM users WHERE id = ?`).bind(Number(row.user_id)).first();
    if (u) return { ok: true, owner_type: 'Person', owner_id: u.id, label: u.n };
    return { ok: false, reason: 'user_id ' + row.user_id + ' 없음' };
  }
  if (!name) return { ok: false, reason: '이름 없음' };
  const { results } = await db.prepare(
    `SELECT id, COALESCE(real_name, name) AS n FROM users
     WHERE (real_name = ? OR name = ?)
       AND (approval_status IS NULL OR approval_status NOT IN ('deleted','merged','withdrawn'))`
  ).bind(name, name).all();
  const list = results || [];
  if (list.length === 1) return { ok: true, owner_type: 'Person', owner_id: list[0].id, label: list[0].n };
  if (list.length > 1) return { ok: false, reason: '동명이인 ' + list.length + '명 — JSON 에 user_id 지정 필요', candidates: list.map(u => u.n + '#' + u.id) };
  return { ok: false, reason: '이름 매칭 실패' };
}

export async function onRequestPost(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureCols(db);

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const now = kst();

  /* ── 미리보기 (DB 변경 0) ── */
  if (action === 'preview') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return Response.json({ error: 'rows 필요' }, { status: 400 });
    if (rows.length > 300) return Response.json({ error: '한 번에 300건 이하로' }, { status: 400 });

    const analysis = [];
    /* 사장님이 모달에서 명시적으로 체크했을 때만 기존 값 교체 (기본 false) */
    const overwrite = body.overwrite === true;
    const sum = { total: rows.length, matched: 0, unmatched: 0, newFiling: 0, fillExisting: 0, noChange: 0, overwritten: 0, overwrite };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const a = { idx: i, name: row.name, fiscal_year: Number(row.fiscal_year) || 0, type: row.type };
      if (!FILING_TYPES.includes(row.type) || !a.fiscal_year) {
        a.status = 'error'; a.reason = 'type/fiscal_year 확인';
        sum.unmatched++; analysis.push(a); continue;
      }
      const fields = {};
      for (const k of FIELD_KEYS) {
        const v = Number((row.fields || {})[k]);
        if ((row.fields || {})[k] !== undefined && (row.fields || {})[k] !== null && !Number.isNaN(v)) fields[k] = v;
      }
      if (!Object.keys(fields).length) { a.status = 'error'; a.reason = '숫자 필드 없음'; sum.unmatched++; analysis.push(a); continue; }

      /* 부가세 세부(매출세액·매입세액 등) — 1단계 객체만, 값은 유한 숫자만.
         키 화이트리스트·개수 제한은 chat.js 렌더 규칙과 동일 (프롬프트 주입 차단). */
      const rawVat = (row.fields || {}).vat;
      if (rawVat && typeof rawVat === 'object' && !Array.isArray(rawVat)) {
        const vat = {};
        for (const [vk, vv] of Object.entries(rawVat)) {
          if (Object.keys(vat).length >= 8) break;
          const key = String(vk).trim();
          if (!key || key.length > 20 || !/^[가-힣A-Za-z0-9_ ()]+$/.test(key)) continue;
          const nv = Number(vv);
          if (vv === null || vv === '' || !Number.isFinite(nv)) continue;
          vat[key] = nv;
        }
        if (Object.keys(vat).length) fields.vat = vat;
      }

      /* 공제·감면 / 가산세 내역 (2026-09-15 사장님: "내가 뭔 공제 받았는지 이것도 들어가야지").
         검토표의 '세액공제·감면' 칸은 이 배열의 합계를 자동 계산해 보여주고,
         청구서 Section 3 도 이 배열을 끌어간다. 숫자 하나만으로는 부족.
         항목 shape 은 검토표·청구서가 읽는 것과 동일: { code?, name, amount } */
      for (const [listKey, cap] of [['deductions', 30], ['penalties', 20]]) {
        const raw = (row.fields || {})[listKey];
        if (!Array.isArray(raw)) continue;
        const list = [];
        for (const it of raw) {
          if (list.length >= cap) break;
          if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
          const name = String(it.name ?? it['종류'] ?? '').trim();
          if (!name || name.length > 40 || /[\u0000-\u001f]/.test(name)) continue;
          const amt = Number(it.amount ?? it['금액']);
          if (!Number.isFinite(amt)) continue;
          const item = { name, amount: amt };
          const code = String(it.code ?? '').trim();
          if (code && /^[A-Za-z0-9_-]{1,10}$/.test(code)) item.code = code;
          list.push(item);
        }
        if (list.length) fields[listKey] = list;
      }

      a.fields = fields;

      const m = await matchOwner(db, row);
      if (!m.ok) { a.status = 'unmatched'; a.reason = m.reason; a.candidates = m.candidates; sum.unmatched++; analysis.push(a); continue; }
      a.owner_type = m.owner_type; a.owner_id = m.owner_id; a.owner_label = m.label;
      sum.matched++;

      const existing = await db.prepare(
        `SELECT id, auto_fields, source FROM filings
         WHERE owner_type = ? AND owner_id = ? AND type = ? AND fiscal_year = ? AND (deleted_at IS NULL OR deleted_at = '')
         ORDER BY id DESC LIMIT 1`
      ).bind(m.owner_type, m.owner_id, row.type, a.fiscal_year).first();
      if (existing) {
        let af = {};
        try { af = JSON.parse(existing.auto_fields || '{}'); } catch (_) {}
        const isEmpty = (k) => af[k] === undefined || af[k] === null || af[k] === '' || (Number(af[k]) === 0 && fields[k] !== 0);
        /* 값이 실제로 다른가 — 객체(vat)는 JSON 비교 */
        const differs = (k) => JSON.stringify(af[k]) !== JSON.stringify(fields[k]);
        const willFill = Object.keys(fields).filter(k => isEmpty(k) || (overwrite && differs(k)));
        /* 기존 값이 있는데 신고서 값으로 교체되는 것 — 미리보기에서 따로 보여준다 */
        a.overwrites = overwrite
          ? Object.keys(fields)
              .filter(k => !isEmpty(k) && differs(k))
              .map(k => ({ key: k, before: af[k], after: fields[k] }))
          : [];
        if (a.overwrites.length) sum.overwritten += a.overwrites.length;
        a.existing_id = existing.id;
        a.will_fill = willFill;
        a.kept = Object.keys(fields).filter(k => !willFill.includes(k));
        if (willFill.length) { a.status = 'fill'; sum.fillExisting++; } else { a.status = 'nochange'; sum.noChange++; }
      } else {
        a.status = 'new'; sum.newFiling++;
      }
      analysis.push(a);
    }

    const r = await db.prepare(
      `INSERT INTO filing_import_batches (source_file, status, preview_data, summary, created_at)
       VALUES (?, 'preview', ?, ?, ?)`
    ).bind(String(body.source_file || 'claude_upload').slice(0, 200), JSON.stringify(analysis), JSON.stringify(sum), now).run();
    return Response.json({ ok: true, batch_id: r?.meta?.last_row_id, summary: sum, analysis });
  }

  /* ── 확정 심기 ── */
  if (action === 'commit') {
    const batchId = Number(body.batch_id);
    if (!batchId) return Response.json({ error: 'batch_id 필요' }, { status: 400 });
    const batch = await db.prepare(`SELECT * FROM filing_import_batches WHERE id = ?`).bind(batchId).first();
    if (!batch) return Response.json({ error: 'batch 없음' }, { status: 404 });
    if (batch.status !== 'preview') return Response.json({ error: 'preview 상태만 확정 가능 (현재: ' + batch.status + ')' }, { status: 400 });

    let analysis;
    try { analysis = JSON.parse(batch.preview_data || '[]'); } catch { return Response.json({ error: 'preview 데이터 손상' }, { status: 500 }); }

    const stats = { created: 0, filled: 0, skipped: 0, overwritten: 0 };
    for (const a of analysis) {
      if (a.status === 'new') {
        await db.prepare(
          `INSERT INTO filings (type, fiscal_year, owner_type, owner_id, auto_fields, review_status,
                                source, verified_at, verified_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '작성중', 'upload', ?, ?, ?, ?)`
        ).bind(a.type, a.fiscal_year, a.owner_type, a.owner_id, JSON.stringify(a.fields), now, '사장님(Claude 추출 검수)', now, now).run();
        stats.created++;
        logAudit(db, { actor: '사장님', action: 'filing_import_create', entity_type: 'filing', entity_id: null, after: (a.owner_label || a.name) + ' ' + a.fiscal_year + ' ' + a.type, request: context.request });
      } else if (a.status === 'fill' && a.existing_id) {
        const existing = await db.prepare(`SELECT auto_fields FROM filings WHERE id = ?`).bind(a.existing_id).first();
        let af = {};
        try { af = JSON.parse(existing?.auto_fields || '{}'); } catch (_) {}
        const before = JSON.stringify(af);
        for (const k of (a.will_fill || [])) af[k] = a.fields[k];
        await db.prepare(
          `UPDATE filings SET auto_fields = ?, verified_at = COALESCE(verified_at, ?), updated_at = ? WHERE id = ?`
        ).bind(JSON.stringify(af), now, now, a.existing_id).run();
        stats.filled++;
        const ow = (a.overwrites || []).length;
        if (ow) stats.overwritten += ow;
        logAudit(db, { actor: '사장님', action: ow ? 'filing_import_overwrite' : 'filing_import_fill', entity_type: 'filing', entity_id: a.existing_id, before, after: JSON.stringify(af), request: context.request });
      } else {
        stats.skipped++;
      }
    }
    await db.prepare(
      `UPDATE filing_import_batches SET status = 'committed', committed_at = ?, summary = ? WHERE id = ?`
    ).bind(now, JSON.stringify(stats), batchId).run();
    return Response.json({ ok: true, stats });
  }

  return Response.json({ error: 'action=preview|commit' }, { status: 400 });
}
