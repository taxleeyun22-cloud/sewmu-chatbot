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

/* user dedup — 사장님 명령 (2026-05-08, v11 최종 룰):
 *   "이름같고 생년월일 다 없는거 같은데 생년월일 같은게 있음 묶어버리면 되지"
 *   "적혀있는데 다르면 무조건 다른 사람인거야"
 *
 * 룰:
 *   [개인/법인 무관] 매 row 의 row.ceo (대표 이름) 기준:
 *     1. 같은 이름 (real_name OR name) 의 user 중 가장 오래된 (id ASC) 부터 검사
 *     2. 그 user 의 birth_date 와 신규 row 의 birth_date 둘 다 있고 다르면 → skip (동명이인)
 *     3. 그 외 모두 (둘 다 같음 / 한쪽 없음 / 둘 다 없음) → 매칭 ✓
 *
 *   법인 대표는 birth_date X → 같은 이름 개인사업자와 자동 묶임 (한쪽 없음)
 *   동명이인 (birth_date 둘 다 있고 다름) 만 별도 user
 *   법인 자체 dedup 은 business 의 사업자번호 (이미 처리). corporate_number 는 business 컬럼만.
 */
async function findExistingUser(db, row, salt) {
  const isCorp = row.corp_or_indiv === '법인';
  const cleanNo = String(row.resident_or_corp_no || '').replace(/\D/g, '');

  /* birth_date / back_hash 추출 — 개인만 (법인번호는 13자리지만 birth_date 의미 없음) */
  let birth_date = null, back_hash = null;
  if (!isCorp && cleanNo.length === 13) {
    const parsed = parseRRN(row.resident_or_corp_no);
    birth_date = parsed.birth_date;
    if (parsed.back_raw) back_hash = await sha256Hex(parsed.back_raw + ':' + salt);
  }

  if (!row.ceo) {
    return { user: null, match_by: null, back_hash, birth_date, is_corp: isCorp };
  }

  /* 같은 이름 candidates 모두 fetch (id ASC) */
  const { results } = await db.prepare(
    `SELECT * FROM users
     WHERE (real_name = ? OR name = ?)
       AND (deleted_at IS NULL OR deleted_at = '')
     ORDER BY id ASC`
  ).bind(row.ceo, row.ceo).all();

  for (const u of (results || [])) {
    /* 사장님 룰: 둘 다 birth_date 있고 다르면 → 동명이인 → skip */
    if (u.birth_date && birth_date && u.birth_date !== birth_date) continue;
    /* 그 외 모두 매칭 (둘 다 같음 / 한쪽 없음 / 둘 다 없음) */
    return { user: u, match_by: 'name+birth_compatible', back_hash, birth_date, is_corp: isCorp };
  }

  return { user: null, match_by: null, back_hash, birth_date, is_corp: isCorp };
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

  /* 사장님 명령 (2026-05-08): 본점 직접 등록 후 corp_no 그룹 일괄 parent_business_id SET.
   * POST ?action=set_parent_for_corp body { corp_no, main_business_id? OR main_keyword? OR main_biz_no? }
   * 옆커폰 174811-0101397 그룹 14개 → "주식회사 옆커폰(유킹본점)" 본점 ID 로 SET 같은 케이스 */
  if (action === 'set_parent_for_corp') {
    const corp_no = String(body.corp_no || '').trim();
    if (!corp_no) return Response.json({ ok: false, error: 'corp_no 필요' }, { status: 400 });
    let mainId = Number(body.main_business_id || 0);
    /* main_keyword: 회사명 LIKE '%keyword%' 매칭 */
    if (!mainId && body.main_keyword) {
      try {
        const m = await db.prepare(
          `SELECT id, company_name, business_number, corporate_number FROM businesses
           WHERE company_name LIKE ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 5`
        ).bind('%' + String(body.main_keyword).trim() + '%').all();
        const results = m.results || [];
        if (!results.length) return Response.json({ ok: false, error: 'keyword 매칭 사업장 없음' }, { status: 404 });
        if (results.length > 1) return Response.json({ ok: false, error: 'keyword 매칭 다중 (' + results.length + '건)', candidates: results }, { status: 400 });
        mainId = results[0].id;
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 500 });
      }
    }
    /* main_biz_no: 사업자번호 매칭 */
    if (!mainId && body.main_biz_no) {
      try {
        const bn = normBiz(body.main_biz_no);
        const m = await db.prepare(
          `SELECT id FROM businesses WHERE business_number = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`
        ).bind(bn).first();
        if (!m) return Response.json({ ok: false, error: 'main_biz_no 매칭 사업장 없음' }, { status: 404 });
        mainId = m.id;
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 500 });
      }
    }
    if (!mainId) return Response.json({ ok: false, error: 'main_business_id / main_keyword / main_biz_no 중 하나 필요' }, { status: 400 });

    /* main 자체 corporate_number 가 같은지 자동 enrichment + parent SET (corporate_number 가 없거나 다른 경우) */
    try {
      const main = await db.prepare(
        `SELECT id, company_name, business_number, corporate_number FROM businesses WHERE id = ?`
      ).bind(mainId).first();
      if (!main) return Response.json({ ok: false, error: 'main_business_id 사업장 없음' }, { status: 404 });

      /* main 의 corporate_number 비어있으면 채움 (사장님 직접 등록 시 안 채울 수 있음) */
      if (!main.corporate_number) {
        try {
          await db.prepare(
            `UPDATE businesses SET corporate_number = ? WHERE id = ? AND (corporate_number IS NULL OR corporate_number = '')`
          ).bind(corp_no, mainId).run();
        } catch {}
      }

      /* 같은 corp_no 의 다른 사업장 (main 제외) parent_business_id SET */
      const r = await db.prepare(
        `UPDATE businesses SET parent_business_id = ?
         WHERE corporate_number = ? AND id != ? AND (deleted_at IS NULL OR deleted_at = '')`
      ).bind(mainId, corp_no, mainId).run();

      /* 결과 — 매핑된 지점 list */
      const branchesQ = await db.prepare(
        `SELECT id, company_name, business_number FROM businesses
         WHERE corporate_number = ? AND id != ? AND parent_business_id = ? AND (deleted_at IS NULL OR deleted_at = '')
         ORDER BY id`
      ).bind(corp_no, mainId, mainId).all();
      return Response.json({
        ok: true,
        main: { id: main.id, company_name: main.company_name, business_number: main.business_number },
        corp_no,
        updated: r?.meta?.changes || 0,
        branches: branchesQ.results || [],
      });
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  /* 사장님 명령 (2026-05-08): batch 의 user 일괄 status 변경 — pending 으로 잘못 INSERT 된 거 빠른 fix.
   * POST ?action=set_batch_users_status body { batch_id, status } */
  if (action === 'set_batch_users_status') {
    const batchId = Number(body.batch_id || 0);
    const status = String(body.status || '').trim();
    if (!batchId || !status) return Response.json({ ok: false, error: 'batch_id, status 필요' }, { status: 400 });
    const allowed = ['pending', 'approved_client', 'approved_guest', 'rejected', 'terminated'];
    if (!allowed.includes(status)) return Response.json({ ok: false, error: 'invalid status' }, { status: 400 });
    try {
      const r = await db.prepare(
        `UPDATE users SET approval_status = ? WHERE import_batch_id = ?`
      ).bind(status, batchId).run();
      return Response.json({ ok: true, batch_id: batchId, status, updated: r?.meta?.changes || 0 });
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

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

      /* user dedup — 사장님 명령 (2026-05-08): 개인 = 이름+주민번호 strict / 법인 = 법인번호 단독 */
      if (row.ceo) {
        const matchResult = await findExistingUser(db, row, SALT);
        if (matchResult.user) {
          analysis.user = {
            action: 'matched',
            existing_id: matchResult.user.id,
            match_by: matchResult.match_by,
            is_corp: matchResult.is_corp,
            birth_date: matchResult.birth_date,
            back_hash: matchResult.back_hash,
          };
          /* enrichment check — 빈 컬럼만 채움 (사장님 입력 절대 우선) */
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
          analysis.user = {
            action: 'new',
            birth_date: matchResult.birth_date,
            back_hash: matchResult.back_hash,
            is_corp: matchResult.is_corp,
          };
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
    /* 신규 user — bulk INSERT.
     * 사장님 명령 (2026-05-08, v11 최종 룰):
     *   "이름같고 생년월일 다 없는거 같은데 생년월일 같은게 있음 묶어버리면 되지"
     *   "적혀있는데 다르면 무조건 다른 사람인거야"
     *
     * 알고리즘:
     *   1. 같은 이름 group 만들기 (법인/개인 구분 X — 사장님 룰 통일)
     *   2. 각 group 안 unique birth_dates 수집 (None 제외)
     *      - unique <= 1 → 모두 1 user (effectiveBirth = unique 값 또는 '')
     *      - unique > 1 → 동명이인 — birth_date 별 분리.
     *        birth_date 없는 row 는 첫 번째 (sorted) 로 묶음 (사장님 룰 명시 안 한 케이스, 안전 default)
     *   3. provider_id = 'manual:wehago:i:이름:effectiveBirth'
     *      → 같은 이름+같은 effectiveBirth = 같은 provider_id = INSERT OR IGNORE 자동 dedup
     */

    /* Step 1: 같은 이름 group 만들기 */
    const nameGroups = {}; /* name -> [analysis] */
    for (const a of details) {
      if (a.user.action !== 'new' || !a.row.ceo) continue;
      if (!nameGroups[a.row.ceo]) nameGroups[a.row.ceo] = [];
      nameGroups[a.row.ceo].push(a);
    }

    /* Step 2: 각 row 의 effectiveBirth 결정 */
    for (const name of Object.keys(nameGroups)) {
      const group = nameGroups[name];
      const uniqueBirths = [...new Set(group.map(a => a.user.birth_date).filter(Boolean))].sort();
      const fallbackBirth = uniqueBirths.length > 0 ? uniqueBirths[0] : '';
      for (const a of group) {
        a.effectiveBirth = a.user.birth_date || fallbackBirth;
      }
    }

    /* Step 3: provider_id 결정 + bulk INSERT 준비 */
    const userInfo = []; /* { row_no, providerId } */
    const userValues = [];
    const seenProviderIds = new Set();
    for (const a of details) {
      const row = a.row;
      if (a.user.action !== 'new' || !row.ceo) continue;
      const effBirth = a.effectiveBirth || '';
      /* provider_id 통일: 법인/개인 무관 — 이름 + effectiveBirth */
      const providerId = 'manual:wehago:i:' + row.ceo + ':' + effBirth;
      userInfo.push({ row_no: row.no, providerId });
      if (seenProviderIds.has(providerId)) continue;
      seenProviderIds.add(providerId);
      /* DB 저장: effectiveBirth (있으면) 가 user.birth_date — group 안 한 row 라도 birth_date 있으면 모두 그 값 사용 (사장님 룰: 한쪽 없음 → 묶음, 그 birth_date 채움) */
      const dbBirth = effBirth || null;
      const backHash = a.user.back_hash || null;
      userValues.push([
        row.ceo, row.ceo, row.phone || null, providerId,
        dbBirth, backHash, batchId, now
      ]);
    }
    /* bulk INSERT — 사장님 명령 (2026-05-08): "위하고 import = 기장거래처".
     * approval_status='approved_client' (default 'pending' 폐기) */
    for (let i = 0; i < userValues.length; i += CHUNK_USER) {
      const chunk = userValues.slice(i, i + CHUNK_USER);
      const placeholders = chunk.map(() => "(?, ?, ?, 'manual', ?, 'approved_client', ?, ?, ?, ?)").join(', ');
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
