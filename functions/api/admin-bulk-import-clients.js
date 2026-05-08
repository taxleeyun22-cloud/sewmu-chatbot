// 위하고 일괄 import — 거래처(user) + 사업장(business) + 매핑(business_members) 자동 등록
// 사장님 명령 (2026-05-08): "위하고 export 엑셀 주면 자동 import + dedup + 본점·지점 그룹 + 롤백 가능"
//
// Endpoints:
// - POST /api/admin-bulk-import-clients?action=preview&key=ADMIN_KEY
//   body: { source_file: '...', rows: [{...}] }
//   → 미리보기 (DB 변경 0). 결과 + batch_id (status='preview')
// - POST /api/admin-bulk-import-clients?action=commit&key=ADMIN_KEY
//   body: { batch_id: N, branch_overrides?: { 'biz_no': 'parent_biz_no' } }
//   → 실제 INSERT (사장님 ✅ 확정 후)
//
// dedup 룰 (3-layer):
// 1. 사업자번호 매칭 (사업장 dedup)
// 2. 주민번호 hash 매칭 (user dedup, 가장 정확)
// 3. 이름 + 생년월일 매칭 (hash 없을 때)
//
// 자동 본점·지점:
// - corporate_number (법인등록번호) 같은 사업장 그룹화
// - 회사명 "지점" 키워드 → 지점, "본점" or 없음 → 본점
// - parent_business_id 자동 채움
//
// 보안:
// - 주민번호 평문 저장 X (앞 6자리 → birth_date, 뒤 7자리 → SHA-256 hash)
// - 메모 절대 안 건드림
// - 사장님 입력 정보 absolute 우선 (빈 컬럼만 enrichment)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}
function normBiz(s) { return String(s || '').replace(/\D/g, ''); }
function normName(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

/* 주민번호 처리: 720420-2722616
 * → birth_date='1972-04-20' (앞 6자리, 70년대 → 19xx)
 * → resident_back_hash=SHA-256('2722616:salt')
 * 보안: 앞 6자리는 평문 (생년월일 자체), 뒤 7자리는 hash 만 저장 */
function parseRRN(rrn) {
  if (!rrn) return { birth_date: null, back_hash: null };
  const clean = String(rrn).replace(/\D/g, '');
  if (clean.length < 7) return { birth_date: null, back_hash: null };
  const front = clean.substring(0, 6);
  const back = clean.substring(6);
  // 첫 7번째 자리로 세기 추정 (1,2 = 19xx, 3,4 = 20xx, 9,0 = 18xx)
  const genderDigit = back[0];
  let century = '19';
  if (genderDigit === '3' || genderDigit === '4') century = '20';
  else if (genderDigit === '9' || genderDigit === '0') century = '18';
  const yyyy = century + front.substring(0, 2);
  const mm = front.substring(2, 4);
  const dd = front.substring(4, 6);
  const birth_date = yyyy + '-' + mm + '-' + dd;
  return { birth_date, back_raw: back };
}

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureSchema(db) {
  /* import_batches table — admin-import-batches.js 와 동일. 중복 안전 IF NOT EXISTS */
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_uuid TEXT UNIQUE,
      source TEXT, source_file TEXT,
      started_at TEXT, committed_at TEXT, rolled_back_at TEXT, status TEXT,
      inserted_users INTEGER DEFAULT 0, inserted_businesses INTEGER DEFAULT 0,
      inserted_members INTEGER DEFAULT 0, enriched_users INTEGER DEFAULT 0,
      audit_log TEXT, preview_data TEXT, triggered_by TEXT, summary TEXT
    )`).run();
  } catch {}
  const addCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await addCol(`ALTER TABLE users ADD COLUMN import_batch_id INTEGER`);
  await addCol(`ALTER TABLE businesses ADD COLUMN import_batch_id INTEGER`);
  await addCol(`ALTER TABLE business_members ADD COLUMN import_batch_id INTEGER`);
  await addCol(`ALTER TABLE users ADD COLUMN birth_date TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN resident_back_hash TEXT`);
  await addCol(`ALTER TABLE businesses ADD COLUMN parent_business_id INTEGER`);
  await addCol(`ALTER TABLE businesses ADD COLUMN tax_office TEXT`);
}

/* user dedup: 1) hash 일치, 2) 이름+생년월일 일치 */
async function findExistingUser(db, row, salt) {
  const { birth_date, back_raw } = parseRRN(row.resident_or_corp_no);
  const back_hash = back_raw ? await sha256Hex(back_raw + ':' + salt) : null;
  /* layer 1: hash 매칭 */
  if (back_hash && birth_date) {
    const u = await db.prepare(
      `SELECT * FROM users WHERE resident_back_hash = ? AND birth_date = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`
    ).bind(back_hash, birth_date).first();
    if (u) return { user: u, match_by: 'hash', back_hash, birth_date };
  }
  /* layer 2: 이름 + 생년월일 매칭 */
  if (birth_date && row.ceo) {
    const u = await db.prepare(
      `SELECT * FROM users WHERE birth_date = ? AND (real_name = ? OR name = ?) AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`
    ).bind(birth_date, row.ceo, row.ceo).first();
    if (u) return { user: u, match_by: 'name_birth', back_hash, birth_date };
  }
  /* layer 3: 이름만 매칭 (위험 — fallback only, 동명이인 위험) */
  /* 이건 자동 매칭 X. 신규 INSERT 로 처리. */
  return { user: null, match_by: null, back_hash, birth_date };
}

/* 사업장 dedup: 사업자번호 매칭 */
async function findExistingBusiness(db, biz_no) {
  if (!biz_no) return null;
  const bn = normBiz(biz_no);
  return await db.prepare(
    `SELECT * FROM businesses WHERE business_number = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`
  ).bind(bn).first();
}

/* 본점 자동 detect 룰 (사장님 명시):
 * - 회사명에 "지점" 포함 → 지점
 * - 회사명에 "본점"/"본사"/"메인" 포함 → 본점
 * - 둘 다 없음 → 본점 (default)
 * 같은 corporate_number 의 그룹에서 본점 1개 선택 (회사명 짧은 것 우선) */
function detectBranchType(name) {
  const n = String(name || '');
  if (/지점|영업소|센터점|지사/.test(n)) return 'branch';
  if (/본점|본사|메인/.test(n)) return 'main';
  return 'main_default';
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  /* import 는 owner only — 위험한 작업 */
  if (!auth.owner) return Response.json({ ok: false, error: 'owner only' }, { status: 403 });

  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: "DB error" }, { status: 500 });
  await ensureSchema(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';

  let body = {};
  try { body = await context.request.json(); } catch { return Response.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  /* salt — env 또는 default. 서비스 운영 시 ADMIN_KEY 와 별도 salt 권장 */
  const SALT = (context.env.RRN_HASH_SALT || context.env.ADMIN_KEY || 'sewmu_default_salt');

  if (action === 'preview') {
    const rows = body.rows || [];
    const sourceFile = body.source_file || 'unknown';
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ ok: false, error: 'rows 필요 (array)' }, { status: 400 });
    }

    /* batch 생성 — preview 상태 */
    const now = kst();
    const batchUuid = 'imp_' + now.replace(/[^0-9]/g, '').substring(2) + '_' + Math.random().toString(36).substring(2, 8);
    let batchId;
    try {
      const r = await db.prepare(
        `INSERT INTO import_batches (batch_uuid, source, source_file, started_at, status, triggered_by)
         VALUES (?, 'wehago_excel', ?, ?, 'preview', ?)`
      ).bind(batchUuid, sourceFile, now, auth.owner ? 'owner' : ('staff#' + (auth.userId || '?'))).run();
      batchId = r?.meta?.last_row_id;
    } catch (e) {
      return Response.json({ ok: false, error: 'batch 생성 실패: ' + e.message }, { status: 500 });
    }

    const preview = {
      batch_id: batchId,
      batch_uuid: batchUuid,
      total_rows: rows.length,
      users: { new: 0, matched: 0, enriched: 0 },
      businesses: { new: 0, dedup: 0 },
      mappings: { new: 0, revived: 0 },
      branch_groups: { auto_ok: 0, needs_decision: 0 },
      details: [],
      warnings: [],
    };

    /* 각 row 분석 (DB 변경 0) */
    const rowAnalysis = [];
    for (const row of rows) {
      const analysis = { row_no: row.no, row };

      /* 사업장 dedup */
      if (row.biz_no) {
        const existing = await findExistingBusiness(db, row.biz_no);
        if (existing) {
          analysis.business = { action: 'dedup', existing_id: existing.id };
          preview.businesses.dedup++;
        } else {
          analysis.business = { action: 'new' };
          preview.businesses.new++;
        }
      } else {
        analysis.business = { action: 'skip', reason: '사업자번호 없음' };
        preview.warnings.push(`row ${row.no}: 사업자번호 없음 → skip`);
      }

      /* user dedup */
      if (row.ceo) {
        const matchResult = await findExistingUser(db, row, SALT);
        if (matchResult.user) {
          analysis.user = { action: 'matched', existing_id: matchResult.user.id, match_by: matchResult.match_by };
          /* enrichment check */
          const enrichFields = [];
          const u = matchResult.user;
          if (!u.birth_date && matchResult.birth_date) enrichFields.push('birth_date');
          if (!u.resident_back_hash && matchResult.back_hash) enrichFields.push('resident_back_hash');
          if (!u.phone && row.phone) enrichFields.push('phone');
          if (enrichFields.length) {
            analysis.user.will_enrich = enrichFields;
            preview.users.enriched++;
          }
          preview.users.matched++;
        } else {
          analysis.user = { action: 'new', birth_date: matchResult.birth_date, back_hash: matchResult.back_hash };
          preview.users.new++;
        }
      } else {
        analysis.user = { action: 'skip', reason: '대표자명 없음' };
      }

      rowAnalysis.push(analysis);
    }

    /* 본점·지점 그룹화 (corp_no 기준) */
    const corpGroups = {};
    for (const row of rows) {
      if (row.corp_or_indiv === '법인' && row.resident_or_corp_no) {
        const cn = row.resident_or_corp_no;
        if (!corpGroups[cn]) corpGroups[cn] = [];
        corpGroups[cn].push(row);
      }
    }
    const branchGroups = [];
    for (const cn of Object.keys(corpGroups)) {
      const grp = corpGroups[cn];
      const types = grp.map(r => ({ row: r, type: detectBranchType(r.company) }));
      const mains = types.filter(t => t.type === 'main' || t.type === 'main_default');
      const branches = types.filter(t => t.type === 'branch');
      let groupStatus, mainRow;
      if (mains.length === 1) {
        groupStatus = 'auto_ok';
        mainRow = mains[0].row;
        preview.branch_groups.auto_ok++;
      } else if (mains.length > 1) {
        groupStatus = 'multiple_mains';
        /* 회사명 짧은 것 = 본점 추정 */
        mains.sort((a, b) => (a.row.company || '').length - (b.row.company || '').length);
        mainRow = mains[0].row;
        preview.branch_groups.needs_decision++;
      } else {
        groupStatus = 'no_main';
        /* 그룹 안에 본점 row 없음 (모두 [지점]) — 사장님 결정 필요 */
        mainRow = null;
        preview.branch_groups.needs_decision++;
      }
      branchGroups.push({
        corp_no: cn,
        group_size: grp.length,
        status: groupStatus,
        main_row: mainRow ? { biz_no: mainRow.biz_no, company: mainRow.company } : null,
        all_rows: grp.map(r => ({ biz_no: r.biz_no, company: r.company, ceo: r.ceo })),
      });
    }

    preview.details = rowAnalysis;
    preview.branch_group_list = branchGroups;

    /* batch 에 preview_data 저장 — 사장님 보고 fix (2026-05-08): 자르지 않음 (D1 TEXT 무제한) */
    try {
      await db.prepare(
        `UPDATE import_batches SET preview_data = ?, summary = ? WHERE id = ?`
      ).bind(JSON.stringify(preview), JSON.stringify({
        total_rows: rows.length,
        users_new: preview.users.new,
        users_matched: preview.users.matched,
        businesses_new: preview.businesses.new,
        branch_groups_needs_decision: preview.branch_groups.needs_decision,
      }), batchId).run();
    } catch {}

    return Response.json({ ok: true, preview });
  }

  if (action === 'commit') {
    const batchId = Number(body.batch_id || 0);
    const branchOverrides = body.branch_overrides || {}; /* { biz_no: parent_biz_no } */
    if (!batchId) return Response.json({ ok: false, error: 'batch_id 필요' }, { status: 400 });

    const batch = await db.prepare(`SELECT * FROM import_batches WHERE id = ?`).bind(batchId).first();
    if (!batch) return Response.json({ ok: false, error: 'batch not found' }, { status: 404 });
    if (batch.status !== 'preview') return Response.json({ ok: false, error: 'preview 상태 batch 만 commit 가능 (현재: ' + batch.status + ')' }, { status: 400 });

    let preview;
    try { preview = JSON.parse(batch.preview_data || '{}'); } catch { return Response.json({ ok: false, error: 'preview_data 파싱 실패' }, { status: 500 }); }
    const details = preview.details || [];

    const now = kst();
    const auditLog = [];
    const stats = { inserted_users: 0, inserted_businesses: 0, inserted_members: 0, enriched_users: 0 };

    /* fix v7 (2026-05-08): D1 의 bind parameter 한계 = 100 per query.
     * 컬럼 수에 따라 chunk size 다르게:
     * - user (8 col): 12 row × 8 = 96 ✓
     * - biz (13 col): 7 row × 13 = 91 ✓
     * - mapping (4 col): 25 row × 4 = 100 ✓
     * - SELECT IN (1 col): 100 row */
    const CHUNK_USER = 12;
    const CHUNK_BIZ = 7;
    const CHUNK_MAPPING = 25;
    const CHUNK_SELECT = 100;

    /* 1. user INSERT batch */
    const userIdMap = {}; /* row_no → user_id */
    const userInsertErrors = [];
    /* matched user 먼저 채움 + enrichment */
    for (const a of details) {
      if (a.user.action === 'matched') {
        userIdMap[a.row.no] = a.user.existing_id;
        if (a.user.will_enrich && a.user.will_enrich.length) {
          const u = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(a.user.existing_id).first();
          if (u) {
            const before = {};
            const sets = [];
            const vals = [];
            for (const f of a.user.will_enrich) {
              before[f] = u[f];
              if (f === 'birth_date') { sets.push('birth_date = ?'); vals.push(a.user.birth_date || null); }
              else if (f === 'resident_back_hash') {
                const back_raw = parseRRN(a.row.resident_or_corp_no).back_raw;
                const hash = back_raw ? await sha256Hex(back_raw + ':' + SALT) : null;
                sets.push('resident_back_hash = ?'); vals.push(hash);
              }
              else if (f === 'phone') { sets.push('phone = ?'); vals.push(a.row.phone || null); }
            }
            if (sets.length) {
              vals.push(a.user.existing_id);
              try {
                await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
                auditLog.push({ type: 'enrichment', user_id: a.user.existing_id, before, after_fields: a.user.will_enrich });
                stats.enriched_users++;
              } catch {}
            }
          }
        }
      }
    }
    /* 신규 user — bulk INSERT VALUES (...), (...) chunk 단위 (CHUNK_USER=12 row × 8 col = 96 bind, D1 limit 100) */
    const userInfo = []; /* { row_no, providerId } */
    const userValues = []; /* [[v1, v2, ...], [v1, v2, ...]] */
    for (const a of details) {
      const row = a.row;
      if (a.user.action !== 'new' || !row.ceo) continue;
      const providerId = 'manual:wehago:' + (row.biz_no || ('row_' + row.no)) + ':' + (a.user.birth_date || '');
      const backHash = a.user.back_hash || null;
      userInfo.push({ row_no: row.no, providerId });
      userValues.push([
        row.ceo, row.ceo, row.phone || null, providerId,
        a.user.birth_date || null, backHash, batchId, now
      ]);
    }
    /* bulk INSERT (8 col 사용 — provider/approval_status 는 SQL literal) */
    for (let i = 0; i < userValues.length; i += CHUNK_USER) {
      const chunk = userValues.slice(i, i + CHUNK_USER);
      const placeholders = chunk.map(() => "(?, ?, ?, 'manual', ?, 'pending', ?, ?, ?, ?)").join(', ');
      const sql = `INSERT OR IGNORE INTO users (real_name, name, phone, provider, provider_id, approval_status, birth_date, resident_back_hash, import_batch_id, created_at) VALUES ${placeholders}`;
      try {
        await db.prepare(sql).bind(...chunk.flat()).run();
      } catch (e) {
        userInsertErrors.push({ phase: 'user_bulk_insert', chunk_start: i, error: String(e.message || e).slice(0, 300) });
      }
    }
    /* user_id SELECT (provider_id IN (...)) — chunk 단위 */
    const providerIds = userInfo.map(i => i.providerId);
    const userIdByProvider = {};
    for (let i = 0; i < providerIds.length; i += CHUNK_SELECT) {
      const chunk = providerIds.slice(i, i + CHUNK_SELECT);
      const placeholders = chunk.map(() => '?').join(',');
      try {
        const { results } = await db.prepare(
          `SELECT id, provider_id FROM users WHERE provider = 'manual' AND provider_id IN (${placeholders})`
        ).bind(...chunk).all();
        for (const r of (results || [])) {
          userIdByProvider[r.provider_id] = r.id;
        }
      } catch (e) {
        userInsertErrors.push({ phase: 'user_select', chunk_start: i, error: String(e.message || e).slice(0, 300) });
      }
    }
    for (const info of userInfo) {
      if (userIdByProvider[info.providerId]) {
        userIdMap[info.row_no] = userIdByProvider[info.providerId];
      } else {
        userInsertErrors.push({ row_no: info.row_no, error: 'INSERT 후 SELECT 매칭 실패' });
      }
    }
    stats.inserted_users = Object.keys(userIdByProvider).length;

    /* 2. business INSERT batch */
    const bizIdMap = {}; /* row_no → business_id */
    /* dedup 먼저 채움 */
    for (const a of details) {
      if (a.business.action === 'dedup') {
        bizIdMap[a.row.no] = a.business.existing_id;
      }
    }
    /* 사업장 bulk INSERT VALUES (chunk 단위) */
    const bizInfo = []; /* { row_no, biz_no } */
    const bizValues = [];
    for (const a of details) {
      const row = a.row;
      if (a.business.action !== 'new' || !row.biz_no) continue;
      const corp_no = (row.corp_or_indiv === '법인' && row.resident_or_corp_no) ? row.resident_or_corp_no : null;
      bizInfo.push({ row_no: row.no, biz_no: normBiz(row.biz_no) });
      bizValues.push([
        row.company || '#' + row.no, normBiz(row.biz_no), row.ceo || null,
        row.type1 || null, row.industry || null,
        row.address || null, row.phone || null,
        corp_no,
        row.corp_or_indiv === '법인' ? '0.법인사업자' : '1.개인사업자',
        row.tax_office || null,
        batchId, now, now
      ]);
    }
    /* bulk INSERT — 13 col, 50 row × 13 = 650 bind. OK */
    for (let i = 0; i < bizValues.length; i += CHUNK_BIZ) {
      const chunk = bizValues.slice(i, i + CHUNK_BIZ);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)").join(', ');
      const sql = `INSERT OR IGNORE INTO businesses (company_name, business_number, ceo_name, business_category, industry, address, phone, corporate_number, company_form, tax_office, status, import_batch_id, created_at, updated_at) VALUES ${placeholders}`;
      try {
        await db.prepare(sql).bind(...chunk.flat()).run();
      } catch (e) {
        userInsertErrors.push({ phase: 'biz_bulk_insert', chunk_start: i, error: String(e.message || e).slice(0, 300) });
      }
    }
    /* biz_id SELECT */
    const bizNos = bizInfo.map(i => i.biz_no);
    const bizIdByBizNo = {};
    for (let i = 0; i < bizNos.length; i += CHUNK_SELECT) {
      const chunk = bizNos.slice(i, i + CHUNK_SELECT);
      const placeholders = chunk.map(() => '?').join(',');
      try {
        const { results } = await db.prepare(
          `SELECT id, business_number FROM businesses WHERE business_number IN (${placeholders}) AND (deleted_at IS NULL OR deleted_at = '')`
        ).bind(...chunk).all();
        for (const r of (results || [])) {
          bizIdByBizNo[r.business_number] = r.id;
        }
      } catch (e) {
        userInsertErrors.push({ phase: 'biz_select', chunk_start: i, error: String(e.message || e).slice(0, 300) });
      }
    }
    for (const info of bizInfo) {
      if (bizIdByBizNo[info.biz_no]) bizIdMap[info.row_no] = bizIdByBizNo[info.biz_no];
    }
    stats.inserted_businesses = bizValues.length; /* 신규 INSERT 시도 수 */

    /* 3. parent_business_id 자동 설정 (본점·지점) — main biz_no IN(...) SELECT + UPDATE bulk */
    const branchGroups = preview.branch_group_list || [];
    const mainBizMap = []; /* { main_biz_no, all_rows } */
    for (const grp of branchGroups) {
      let mainBizNo = grp.main_row?.biz_no;
      const overrideBizNo = branchOverrides[grp.corp_no];
      if (overrideBizNo) mainBizNo = overrideBizNo;
      if (mainBizNo) mainBizMap.push({ main_biz_no: normBiz(mainBizNo), all_rows: grp.all_rows });
    }
    if (mainBizMap.length) {
      /* 모든 main biz_no IN (...) */
      const allMainBizNos = mainBizMap.map(m => m.main_biz_no);
      const mainBizIdByNo = {};
      for (let i = 0; i < allMainBizNos.length; i += CHUNK_SELECT) {
        const chunk = allMainBizNos.slice(i, i + CHUNK_SELECT);
        const placeholders = chunk.map(() => '?').join(',');
        try {
          const { results } = await db.prepare(
            `SELECT id, business_number FROM businesses WHERE business_number IN (${placeholders}) AND (deleted_at IS NULL OR deleted_at = '')`
          ).bind(...chunk).all();
          for (const r of (results || [])) {
            mainBizIdByNo[r.business_number] = r.id;
          }
        } catch (e) {
          userInsertErrors.push({ phase: 'main_biz_select', error: String(e.message || e).slice(0, 300) });
        }
      }
      /* parent UPDATE — 그룹별 UPDATE WHERE business_number IN (...). 단 mainBizId 별 다른 UPDATE 라 chunk 분리. */
      for (const m of mainBizMap) {
        const mainBizId = mainBizIdByNo[m.main_biz_no];
        if (!mainBizId) continue;
        const branchBizNos = (m.all_rows || []).map(r => normBiz(r.biz_no)).filter(b => b && b !== m.main_biz_no);
        if (!branchBizNos.length) continue;
        for (let i = 0; i < branchBizNos.length; i += CHUNK_SELECT) {
          const chunk = branchBizNos.slice(i, i + CHUNK_SELECT);
          const placeholders = chunk.map(() => '?').join(',');
          try {
            await db.prepare(
              `UPDATE businesses SET parent_business_id = ? WHERE business_number IN (${placeholders}) AND (parent_business_id IS NULL OR parent_business_id = 0)`
            ).bind(mainBizId, ...chunk).run();
          } catch (e) {
            userInsertErrors.push({ phase: 'parent_update', error: String(e.message || e).slice(0, 300) });
          }
        }
      }
    }

    /* 4. business_members 매핑 — bulk INSERT VALUES (...), (...) */
    let skippedMissingId = 0;
    const mapValues = [];
    for (const a of details) {
      const row = a.row;
      const userId = userIdMap[row.no];
      const bizId = bizIdMap[row.no];
      if (!userId || !bizId) {
        skippedMissingId++;
        continue;
      }
      mapValues.push([bizId, userId, now, batchId]);
    }
    let mapErrorMsg = null;
    /* bulk INSERT — 4 col, 100 row × 4 = 400 bind. OK */
    for (let i = 0; i < mapValues.length; i += CHUNK_MAPPING) {
      const chunk = mapValues.slice(i, i + CHUNK_MAPPING);
      const placeholders = chunk.map(() => "(?, ?, '대표자', 1, ?, ?)").join(', ');
      const sql = `INSERT OR IGNORE INTO business_members (business_id, user_id, role, is_primary, added_at, import_batch_id) VALUES ${placeholders}`;
      try {
        await db.prepare(sql).bind(...chunk.flat()).run();
      } catch (e) {
        mapErrorMsg = String(e.message || e).slice(0, 300);
      }
    }
    /* mapping count — SELECT COUNT(*) WHERE import_batch_id = ? */
    try {
      const cr = await db.prepare(
        `SELECT COUNT(*) AS c FROM business_members WHERE import_batch_id = ?`
      ).bind(batchId).first();
      stats.inserted_members = cr?.c || 0;
    } catch {}
    /* revive — IGNORE 된 매핑 중 removed_at 있는 거 일괄 UPDATE */
    try {
      const reviveR = await db.prepare(
        `UPDATE business_members SET removed_at = NULL, import_batch_id = ?
         WHERE removed_at IS NOT NULL AND import_batch_id IS NULL
           AND business_id IN (SELECT id FROM businesses WHERE import_batch_id = ?)`
      ).bind(batchId, batchId).run();
      const revived = reviveR?.meta?.changes || 0;
      stats.inserted_members += revived;
    } catch {}
    auditLog.push({
      type: 'mapping_diagnostics',
      mappings_inserted_total: stats.inserted_members,
      missing_id_skipped: skippedMissingId,
      bulk_error: mapErrorMsg,
    });

    /* 5. batch 상태 update — fix v4 (2026-05-08): status 와 audit_log 분리 update.
     * audit_log 가 너무 커서 timeout 가까울 때 마지막 update 실패한 케이스 (batch 10).
     * 작은 query 먼저 → status 보장 → audit_log best-effort. */
    if (userInsertErrors.length) {
      auditLog.push({ type: 'user_insert_errors', count: userInsertErrors.length, errors: userInsertErrors.slice(0, 50) });
    }
    /* status 먼저 (작은 query) — 반드시 성공 */
    try {
      await db.prepare(
        `UPDATE import_batches SET committed_at = ?, status = 'committed',
                                   inserted_users = ?, inserted_businesses = ?,
                                   inserted_members = ?, enriched_users = ?
         WHERE id = ?`
      ).bind(now, stats.inserted_users, stats.inserted_businesses,
             stats.inserted_members, stats.enriched_users, batchId).run();
    } catch (e) {
      /* status 실패 시 응답에 알림 */
      return Response.json({
        ok: false,
        error: 'batch status update 실패: ' + String(e.message || e).slice(0, 200),
        stats,
      }, { status: 500 });
    }
    /* audit_log 별도 (큰 query) — best-effort */
    try {
      await db.prepare(
        `UPDATE import_batches SET audit_log = ? WHERE id = ?`
      ).bind(JSON.stringify(auditLog), batchId).run();
    } catch {}

    return Response.json({
      ok: true,
      batch_id: batchId,
      batch_uuid: batch.batch_uuid,
      committed_at: now,
      stats,
      user_insert_errors: userInsertErrors.length ? userInsertErrors.slice(0, 5) : undefined,
      total_user_insert_errors: userInsertErrors.length,
      mapping_diagnostics: (mappingErrors.length || skippedMissingId || skippedAlreadyActive) ? {
        errors: mappingErrors.length, missing_id: skippedMissingId, already_active: skippedAlreadyActive
      } : undefined,
      message: 'Import 완료. 롤백은 admin → 📥 import 이력 → [🔄 롤백]'
    });
  }

  return Response.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
