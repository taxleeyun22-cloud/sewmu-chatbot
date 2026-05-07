// 관리자 수동 거래처 등록
// OAuth 없이 관리자가 직접 거래처 레코드 생성 (오프라인 고객·기존 거래처 마이그레이션용)
//
// POST /api/admin-clients
//   body: { name, real_name?, phone?, business_number?, company_name?, ceo_name?, notes? }
//   → users 테이블 insert (provider='admin_created', approval_status='approved_client')
//   → 선택: client_businesses insert
//   → 응답: { ok, user_id }
//
// 보안:
// - checkAdmin 인증 (ADMIN_KEY or 스태프 세션)
// - provider='admin_created' 로 명시 → 로그인·세션 절대 못 만듦
// - 민감 정보 없음 (주민번호 X)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

function sanitizeName(s) {
  return String(s || '').trim().replace(/[\r\n\t\x00-\x1f]/g, '').slice(0, 50);
}

function sanitizePhone(s) {
  return String(s || '').trim().replace(/[^\d\-]/g, '').slice(0, 20);
}

function sanitizeBiz(s) {
  /* 사업자번호: 숫자·하이픈만 10~12자 */
  return String(s || '').trim().replace(/[^\d\-]/g, '').slice(0, 15);
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const realName = sanitizeName(body.real_name || body.name || '');
  const displayName = sanitizeName(body.name || body.real_name || '');
  const phone = sanitizePhone(body.phone);
  /* Phase Q4 (2026-05-07): 생년월일 — YYYY-MM-DD 형식, 10자 검증 */
  const birthDate = String(body.birth_date || '').trim().match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(body.birth_date).trim().slice(0, 10)
    : null;
  const businessNumber = sanitizeBiz(body.business_number);
  const companyName = sanitizeName(body.company_name);
  const ceoName = sanitizeName(body.ceo_name || body.real_name);
  const notes = String(body.notes || '').trim().slice(0, 1000);
  /* 위하고 호환 필드 (2026-04-24) — 수동 거래처도 동일 폼 */
  const companyForm = String(body.company_form || '').trim().slice(0, 20) || null;
  const subBizNo = sanitizeBiz(body.sub_business_number);
  const corpNo = sanitizeBiz(body.corporate_number);
  const address = String(body.address || '').trim().slice(0, 200) || null;
  const bizPhone = sanitizePhone(body.biz_phone || body.company_phone);
  const industryCode = String(body.industry_code || '').trim().slice(0, 10) || null;
  const bizCategory = String(body.business_category || '').trim().slice(0, 40) || null;
  const industry = String(body.industry || '').trim().slice(0, 40) || null;
  const estDate = String(body.establishment_date || '').trim().slice(0, 10) || null;
  const fiscalStart = String(body.fiscal_year_start || '').trim().slice(0, 10) || null;
  const fiscalEnd = String(body.fiscal_year_end || '').trim().slice(0, 10) || null;
  const fiscalTerm = body.fiscal_term ? Number(body.fiscal_term) : null;
  const hrYear = body.hr_year ? Number(body.hr_year) : null;

  if (!realName) return Response.json({ error: "이름(real_name) 필수" }, { status: 400 });

  const now = kst();

  /* users 컬럼 보장 — 기존 admin-approve.js 가 만들지만 여기서 안전하게.
   * fix (2026-05-07 사장님 보고): D1_ERROR provider_user_id 누락 → lazy migration 추가 */
  try { await db.prepare(`ALTER TABLE users ADD COLUMN provider TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN provider_user_id TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN name TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN real_name TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN phone TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'pending'`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN approved_at TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN approved_by TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN name_confirmed INTEGER DEFAULT 0`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN created_at TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN last_login_at TEXT`).run(); } catch {}
  /* Phase Q4 (2026-05-07 사장님 명령): 대표자 생년월일 — 주민번호 대신 */
  try { await db.prepare(`ALTER TABLE users ADD COLUMN birth_date TEXT`).run(); } catch {}

  try {
    /* users insert — provider_user_id 는 고유해야 하므로 timestamp 로 생성 */
    const pseudoExternalId = 'admin_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const r = await db.prepare(
      `INSERT INTO users (provider, provider_user_id, name, real_name, phone, birth_date,
                          approval_status, approved_at, approved_by, name_confirmed,
                          created_at, last_login_at)
       VALUES ('admin_created', ?, ?, ?, ?, ?, 'approved_client', ?, 'admin', 1, ?, NULL)`
    ).bind(pseudoExternalId, displayName || realName, realName, phone || null, birthDate, now, now).run();
    const userId = r.meta?.last_row_id;
    if (!userId) return Response.json({ error: "user insert failed" }, { status: 500 });

    /* client_businesses 에도 insert (정보 있으면) — 위하고 전체 필드 포함 */
    if (businessNumber || companyName) {
      try {
        await db.prepare(
          `CREATE TABLE IF NOT EXISTS client_businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            company_name TEXT,
            ceo_name TEXT,
            business_number TEXT,
            address TEXT,
            is_primary INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT
          )`
        ).run();
        /* 위하고 호환 컬럼 lazy ALTER */
        const addCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
        await addCol(`ALTER TABLE client_businesses ADD COLUMN company_form TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN sub_business_number TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN corporate_number TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN business_category TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN industry_code TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN industry TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN phone TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN establishment_date TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN fiscal_year_start TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN fiscal_year_end TEXT`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN fiscal_term INTEGER`);
        await addCol(`ALTER TABLE client_businesses ADD COLUMN hr_year INTEGER`);
        const normBiz = String(businessNumber || "").replace(/\D/g, "");
        const normName = String(companyName || "").replace(/\s+/g, "").toLowerCase();
        let existing = null;
        try {
          const { results: rows } = await db.prepare(
            `SELECT id, company_name, business_number FROM client_businesses WHERE user_id = ?`
          ).bind(userId).all();
          for (const r of (rows || [])) {
            const rb = String(r.business_number || "").replace(/\D/g, "");
            const rn = String(r.company_name || "").replace(/\s+/g, "").toLowerCase();
            if (normBiz && rb && normBiz === rb) { existing = r; break; }
            if (!normBiz && !rb && normName && rn && normName === rn) { existing = r; break; }
          }
        } catch {}
        if (existing) {
          await db.prepare(
            `UPDATE client_businesses SET
               company_name = ?, ceo_name = ?, business_number = ?,
               company_form = ?, sub_business_number = ?, corporate_number = ?,
               address = ?, phone = ?, industry_code = ?, business_category = ?, industry = ?,
               establishment_date = ?, fiscal_year_start = ?, fiscal_year_end = ?,
               fiscal_term = ?, hr_year = ?,
               updated_at = ?
             WHERE id = ?`
          ).bind(
            companyName || existing.company_name || null, ceoName || null, normBiz || null,
            companyForm, subBizNo || null, corpNo || null,
            address, bizPhone || null, industryCode, bizCategory, industry,
            estDate, fiscalStart, fiscalEnd, fiscalTerm, hrYear,
            now, existing.id
          ).run();
        } else {
          await db.prepare(
            `INSERT INTO client_businesses (
               user_id, company_name, ceo_name, business_number,
               company_form, sub_business_number, corporate_number,
               address, phone, industry_code, business_category, industry,
               establishment_date, fiscal_year_start, fiscal_year_end,
               fiscal_term, hr_year,
               is_primary, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
          ).bind(
            userId, companyName || null, ceoName || null, normBiz || null,
            companyForm, subBizNo || null, corpNo || null,
            address, bizPhone || null, industryCode, bizCategory, industry,
            estDate, fiscalStart, fiscalEnd, fiscalTerm, hrYear,
            now, now
          ).run();
        }
      } catch {}

      /* Q3 (2026-05-07 사장님 명령): 새 N:N 매핑 (businesses + business_members) 도 자동 생성.
       * 옛 client_businesses 는 호환 유지. 새 흐름 = 양방향 자동 생성.
       * - body.existing_business_id 있으면 그 ID 사용 (기존 업체 선택)
       * - 없으면 사업자번호 또는 회사명 있을 때 businesses INSERT (없으면) + business_members 매핑 */
      try {
        const existingBizId = Number(body.existing_business_id || 0);
        const normBiz = String(businessNumber || '').replace(/\D/g, '');
        let bizId = null;
        if (existingBizId) {
          /* 사장님이 기존 업체 선택 — 그 ID 그대로 사용 (검증만) */
          const ex = await db.prepare(`SELECT id FROM businesses WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`).bind(existingBizId).first();
          if (ex) bizId = ex.id;
        } else if (normBiz) {
          /* 같은 사업자번호 기존 업체 있으면 재사용 */
          const dup = await db.prepare(`SELECT id FROM businesses WHERE business_number = ? LIMIT 1`).bind(normBiz).first();
          if (dup) bizId = dup.id;
        }
        if (!bizId && !existingBizId && (normBiz || companyName)) {
          /* 신규 INSERT (사용자가 기존 업체 선택 안 한 경우만) */
          const r2 = await db.prepare(
            `INSERT INTO businesses (company_name, business_number, ceo_name, address, phone,
                                     establishment_date, sub_business_number, corporate_number,
                                     business_category, industry_code, industry, company_form,
                                     fiscal_year_start, fiscal_year_end, fiscal_term, hr_year,
                                     status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
          ).bind(
            companyName || ceoName || '(이름없음)',
            normBiz || null, ceoName || null, address, bizPhone || null,
            estDate, subBizNo || null, corpNo || null,
            bizCategory, industryCode, industry, companyForm,
            fiscalStart, fiscalEnd, fiscalTerm, hrYear,
            now, now
          ).run();
          bizId = r2.meta?.last_row_id || null;
        }
        if (bizId) {
          /* business_members 매핑 — 기존 매핑 있으면 skip */
          try { await db.prepare(`CREATE TABLE IF NOT EXISTS business_members (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER, user_id INTEGER, role TEXT, is_primary INTEGER DEFAULT 0, added_at TEXT, removed_at TEXT)`).run(); } catch {}
          const existingMap = await db.prepare(
            `SELECT id FROM business_members WHERE business_id = ? AND user_id = ? AND (removed_at IS NULL OR removed_at = '') LIMIT 1`
          ).bind(bizId, userId).first();
          if (!existingMap) {
            await db.prepare(
              `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at) VALUES (?, ?, '대표자', 1, ?)`
            ).bind(bizId, userId, now).run();
          }
        }
      } catch (e) {
        /* 매핑 실패해도 사용자 생성은 성공 */
        console.warn('[admin-clients] business mapping failed:', e.message);
      }
    }

    /* 옵션: 담당자 라벨 + 자동 상담방 생성 */
    const autoCreateRoom = !!body.auto_create_room;
    const priorityRaw = body.priority;
    let priority = null;
    if (priorityRaw !== null && priorityRaw !== undefined && priorityRaw !== '') {
      const n = Number(priorityRaw);
      if (Number.isInteger(n) && n > 0) {
        try {
          const chk = await db.prepare(`SELECT id FROM room_labels WHERE id = ?`).bind(n).first();
          if (chk) priority = n;
        } catch {}
      }
    }
    let createdRoomId = null;
    if (autoCreateRoom) {
      try {
        /* 방 id: 6자리 영숫자 */
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let rid = '';
        for (let i = 0; i < 6; i++) rid += chars[Math.floor(Math.random() * chars.length)];
        const roomName = (companyName || realName) + ' 상담방';
        await db.prepare(
          `INSERT INTO chat_rooms (id, name, created_by_admin, max_members, ai_mode, status, priority, created_at)
           VALUES (?, ?, 1, 10, 'on', 'active', ?, ?)`
        ).bind(rid, roomName, priority, now).run();
        /* 멤버: 거래처 (member) + 관리자 (admin) — 관리자는 admin-rooms.js 로직과 일치 */
        await db.prepare(
          `INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`
        ).bind(rid, userId, now).run();
        /* 관리자(is_admin=1) 자동 참여 */
        try {
          const { results: admins } = await db.prepare(`SELECT id FROM users WHERE is_admin = 1`).all();
          for (const ad of (admins || [])) {
            try {
              await db.prepare(
                `INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)`
              ).bind(rid, ad.id, now).run();
            } catch {}
          }
        } catch {}
        createdRoomId = rid;
      } catch (err) {
        /* 방 생성 실패해도 user 자체는 만들어짐 */
      }
    }

    /* 등록 노트가 있으면 '거래처 정보' 메모로 자동 저장 */
    if (notes) {
      try {
        await db.prepare(`CREATE TABLE IF NOT EXISTS memos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT, target_user_id INTEGER,
          author_user_id INTEGER, author_name TEXT,
          assigned_to_user_id INTEGER,
          memo_type TEXT DEFAULT '할 일',
          content TEXT NOT NULL,
          visibility TEXT DEFAULT 'internal',
          is_edited INTEGER DEFAULT 0,
          due_date TEXT, linked_message_id INTEGER,
          filing_type TEXT, filing_period TEXT,
          created_at TEXT, updated_at TEXT, deleted_at TEXT
        )`).run();
        const authorName = auth.name || auth.realName || (auth.owner ? '대표' : '담당자');
        /* 구버전 room_id NOT NULL 제약 회피용 placeholder */
        await db.prepare(
          `INSERT INTO memos (room_id, target_user_id, author_user_id, author_name, memo_type, content, visibility, created_at, updated_at)
           VALUES ('__none__', ?, ?, ?, '거래처 정보', ?, 'internal', ?, ?)`
        ).bind(userId, auth.userId || null, authorName, notes, now, now).run();
      } catch {}
    }

    return Response.json({ ok: true, user_id: userId, room_id: createdRoomId, priority });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
