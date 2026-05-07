// 🏢 업체(businesses) 관리 — 최상위 거래처 엔티티
//
// GET    /api/admin-businesses?key=                → 업체 목록 (검색·상태 필터)
//        &search= &status=active|closed|terminated
// GET    /api/admin-businesses?key=&id=            → 단건 + 구성원 + 연결된 상담방
// POST   /api/admin-businesses?key=                → 신규 생성 (중복 방지 UPSERT 아님, 중복 감지 후 400)
// PUT    /api/admin-businesses?key=&id=            → 수정
// DELETE /api/admin-businesses?key=&id=            → 삭제 (owner 전용, 연결된 구성원·상담방 해제)

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";
import { checkRole, roleForbidden } from "./_authz.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}
function normBiz(s) { return String(s || '').replace(/\D/g, ''); }
function normName(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

async function ensureTables(db) {
  /* 신규 배포 환경에서 자동 생성 — 마이그레이션 API 와 동일 스키마 */
  await db.prepare(`CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    business_number TEXT,
    ceo_name TEXT,
    industry TEXT,
    business_type TEXT,
    tax_type TEXT,
    establishment_date TEXT,
    address TEXT,
    phone TEXT,
    employee_count INTEGER,
    last_revenue INTEGER,
    vat_period TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active',
    source_client_business_id INTEGER,
    created_at TEXT,
    updated_at TEXT
  )`).run();
  try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN business_id INTEGER`).run(); } catch {}
  /* 🏢 위하고 레이아웃 호환 필드 — 장기적으로 위하고 전표 엑셀 export/import 매핑용 */
  const add = (sql) => db.prepare(sql).run().catch(()=>{});
  await add(`ALTER TABLE businesses ADD COLUMN sub_business_number TEXT`);      /* 종사업자번호 */
  await add(`ALTER TABLE businesses ADD COLUMN corporate_number TEXT`);          /* 법인등록번호 (13자리) */
  await add(`ALTER TABLE businesses ADD COLUMN business_category TEXT`);         /* 업태 */
  await add(`ALTER TABLE businesses ADD COLUMN industry_code TEXT`);             /* 업종코드 (통계청) */
  await add(`ALTER TABLE businesses ADD COLUMN service_type TEXT`);              /* 기장 | 기장외 | 조정 | 신고대행 | 기타 */
  await add(`ALTER TABLE businesses ADD COLUMN contract_date TEXT`);             /* 수임일자 */
  await add(`ALTER TABLE businesses ADD COLUMN fiscal_year_start TEXT`);         /* 회계기간 시작 YYYY-MM-DD */
  await add(`ALTER TABLE businesses ADD COLUMN fiscal_year_end TEXT`);           /* 회계기간 종료 YYYY-MM-DD */
  await add(`ALTER TABLE businesses ADD COLUMN fiscal_term INTEGER`);            /* N기 (몇 번째 회계연도) */
  await add(`ALTER TABLE businesses ADD COLUMN hr_year INTEGER`);                /* 인사연도 */
  await add(`ALTER TABLE businesses ADD COLUMN company_form TEXT`);              /* 회사구분: 법인사업자/개인사업자/간이사업자 등 */
}

export async function onRequestGet(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: 'DB error' }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const userIdParam = url.searchParams.get('user_id');
  const search = (url.searchParams.get('search') || '').trim();
  const status = (url.searchParams.get('status') || '').trim();

  /* 사용자별 매핑된 사업장 (시스템 B: business_members) — user dashboard 의 cdBizDocs 섹션이 사용 */
  if (userIdParam) {
    try {
      const uid = Number(userIdParam);
      if (!uid) return Response.json({ ok: false, error: 'user_id 잘못됨' }, { status: 400 });
      /* biz_docs 테이블 보장 (admin-biz-docs.js 와 동일 스키마) */
      try {
        await db.prepare(`CREATE TABLE IF NOT EXISTS biz_docs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          business_id INTEGER NOT NULL,
          id_card_key TEXT,
          id_card_uploaded_at TEXT,
          biz_reg_key TEXT,
          biz_reg_uploaded_at TEXT,
          hometax_id TEXT,
          hometax_password_enc TEXT,
          hometax_updated_at TEXT,
          created_at TEXT,
          updated_at TEXT,
          UNIQUE(user_id, business_id)
        )`).run();
      } catch {}
      const { results } = await db.prepare(`
        SELECT b.*,
               bm.id AS member_id, bm.role AS member_role,
               bm.is_primary AS member_is_primary,
               bm.added_at AS joined_at,
               bd.id_card_key, bd.id_card_uploaded_at,
               bd.biz_reg_key, bd.biz_reg_uploaded_at,
               bd.hometax_id, bd.hometax_updated_at
          FROM business_members bm
          JOIN businesses b ON bm.business_id = b.id
          LEFT JOIN biz_docs bd ON bd.user_id = bm.user_id AND bd.business_id = b.id
         WHERE bm.user_id = ? AND bm.removed_at IS NULL
         ORDER BY bm.is_primary DESC, bm.added_at ASC
      `).bind(uid).all();
      const businesses = (results || []).map(r => ({
        id: r.id,
        company_name: r.company_name,
        business_number: r.business_number,
        ceo_name: r.ceo_name,
        company_form: r.company_form,
        business_category: r.business_category,
        industry: r.industry,
        industry_code: r.industry_code,
        tax_type: r.tax_type,
        address: r.address,
        phone: r.phone,
        sub_business_number: r.sub_business_number,
        corporate_number: r.corporate_number,
        establishment_date: r.establishment_date,
        contract_date: r.contract_date,
        fiscal_year_start: r.fiscal_year_start,
        fiscal_year_end: r.fiscal_year_end,
        fiscal_term: r.fiscal_term,
        hr_year: r.hr_year,
        notes: r.notes,
        status: r.status,
        member_id: r.member_id,
        member_role: r.member_role,
        member_is_primary: r.member_is_primary,
        joined_at: r.joined_at,
        docs: {
          id_card: { uploaded: !!r.id_card_key, at: r.id_card_uploaded_at || null },
          biz_reg: { uploaded: !!r.biz_reg_key, at: r.biz_reg_uploaded_at || null },
          hometax: { saved: !!(r.hometax_id && r.hometax_id.length), at: r.hometax_updated_at || null, hometax_id: r.hometax_id || null },
        }
      }));
      return Response.json({ ok: true, businesses });
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  if (id) {
    try {
      const biz = await db.prepare(`SELECT * FROM businesses WHERE id = ?`).bind(id).first();
      if (!biz) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
      const { results: members } = await db.prepare(
        `SELECT bm.id, bm.business_id, bm.user_id, bm.role, bm.is_primary, bm.phone, bm.memo, bm.added_at,
                u.real_name, u.name, u.profile_image, u.approval_status, u.phone AS user_phone
           FROM business_members bm
           LEFT JOIN users u ON bm.user_id = u.id
          WHERE bm.business_id = ? AND bm.removed_at IS NULL
          ORDER BY bm.is_primary DESC, bm.added_at ASC`
      ).bind(id).all();
      const { results: rooms } = await db.prepare(
        `SELECT id, name, status, created_at FROM chat_rooms WHERE business_id = ? ORDER BY created_at DESC LIMIT 50`
      ).bind(id).all();
      return Response.json({ ok: true, business: biz, members: members || [], rooms: rooms || [] });
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  /* 목록 */
  let query = `SELECT b.*,
      (SELECT COUNT(*) FROM business_members WHERE business_id = b.id AND removed_at IS NULL) AS member_count,
      (SELECT COUNT(*) FROM chat_rooms WHERE business_id = b.id) AS room_count
      FROM businesses b`;
  const binds = [];
  const where = [];
  if (status) { where.push(`b.status = ?`); binds.push(status); }
  if (search) {
    where.push(`(b.company_name LIKE ? OR b.business_number LIKE ? OR b.ceo_name LIKE ? OR b.phone LIKE ?)`);
    const q = '%' + search + '%';
    binds.push(q, q, q, q);
  }
  if (where.length) query += ' WHERE ' + where.join(' AND ');
  query += ' ORDER BY b.created_at DESC LIMIT 500';
  try {
    const { results } = await db.prepare(query).bind(...binds).all();
    /* 상태별 카운트 */
    const counts = {};
    for (const s of ['active', 'closed', 'terminated']) {
      const r = await db.prepare(`SELECT COUNT(*) AS c FROM businesses WHERE status = ?`).bind(s).first();
      counts[s] = r?.c || 0;
    }
    return Response.json({ ok: true, businesses: results || [], counts });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: 'DB error' }, { status: 500 });
  await ensureTables(db);
  let body = {};
  try { body = await context.request.json(); } catch { return Response.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  /* user 에 사업장 매핑 추가 — user dashboard 의 [+ 🏢 사업장 추가] 버튼이 호출.
     사업자번호로 기존 businesses 행 재사용, 없으면 INSERT. business_members 매핑은 항상 보장.
     biz_docs 행도 같이 보장하여 서류 업로드 즉시 가능. */
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  if (action === 'add_to_user') {
    return await addBusinessToUser(db, body);
  }

  /* Phase (2026-05-07 사장님 명령): 옛 업체 (ceo_name 있지만 user 매핑 0) 일괄 대표자 자동 생성.
   * action=migrate_missing_ceo_users — 사장님이 1회 클릭 → 모든 업체 처리.
   * owner only. */
  if (action === 'migrate_missing_ceo_users') {
    if (!auth.owner) return Response.json({ error: 'owner only' }, { status: 403 });
    try {
      try { await db.prepare(`ALTER TABLE users ADD COLUMN provider TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN provider_user_id TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN real_name TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN birth_date TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN deleted_at TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE businesses ADD COLUMN deleted_at TEXT`).run(); } catch {}
      try { await db.prepare(`CREATE TABLE IF NOT EXISTS business_members (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER, user_id INTEGER, role TEXT, is_primary INTEGER DEFAULT 0, added_at TEXT, removed_at TEXT)`).run(); } catch {}
      const now = kst();
      /* 매핑 user 가 0개인 업체 + ceo_name 있음 */
      const { results: targets } = await db.prepare(`
        SELECT b.id, b.company_name, b.ceo_name, b.phone
        FROM businesses b
        WHERE b.ceo_name IS NOT NULL AND TRIM(b.ceo_name) != ''
          AND (b.deleted_at IS NULL OR b.deleted_at = '')
          AND NOT EXISTS (
            SELECT 1 FROM business_members bm
            WHERE bm.business_id = b.id AND (bm.removed_at IS NULL OR bm.removed_at = '')
          )
      `).all();
      let created = 0, skipped = 0, errors = 0;
      const summary = [];
      for (const biz of (targets || [])) {
        try {
          const ceoName = String(biz.ceo_name || '').trim();
          if (!ceoName) { skipped++; continue; }
          /* 같은 이름의 user 있으면 매핑만 (중복 user INSERT X) */
          let userId = null;
          const dup = await db.prepare(`SELECT id FROM users WHERE real_name = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`).bind(ceoName).first();
          if (dup) {
            userId = dup.id;
          } else {
            /* 신규 INSERT */
            const pseudoExt = 'admin_migrate_' + Date.now() + '_' + biz.id;
            const r = await db.prepare(
              `INSERT INTO users (provider, provider_user_id, name, real_name, phone,
                                  approval_status, approved_at, approved_by, name_confirmed,
                                  created_at, last_login_at)
               VALUES ('admin_created', ?, ?, ?, ?, 'approved_client', ?, 'admin_migrate', 1, ?, NULL)`
            ).bind(pseudoExt, ceoName, ceoName, biz.phone || null, now, now).run();
            userId = r.meta?.last_row_id;
            if (userId) created++;
          }
          if (userId) {
            await db.prepare(
              `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at) VALUES (?, ?, '대표자', 1, ?)`
            ).bind(biz.id, userId, now).run();
            summary.push({ business_id: biz.id, company: biz.company_name, ceo: ceoName, user_id: userId });
          }
        } catch (e) {
          errors++;
        }
      }
      return Response.json({ ok: true, processed: (targets || []).length, created, skipped, errors, summary });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  const name = String(body.company_name || '').trim().slice(0, 120);
  if (!name) return Response.json({ ok: false, error: 'company_name 필요' }, { status: 400 });
  const bn = normBiz(body.business_number);

  /* 중복 감지 — 사업자번호 우선, 없으면 상호 정규화 */
  try {
    if (bn) {
      const dup = await db.prepare(`SELECT id, company_name FROM businesses WHERE business_number = ? LIMIT 1`).bind(bn).first();
      if (dup) return Response.json({ ok: false, error: '같은 사업자번호의 업체가 이미 있습니다: #' + dup.id + ' ' + dup.company_name, duplicate_id: dup.id }, { status: 409 });
    } else {
      const nn = normName(name);
      const { results: all } = await db.prepare(`SELECT id, company_name FROM businesses WHERE business_number IS NULL OR business_number = ''`).all();
      const dup = (all || []).find(b => normName(b.company_name) === nn);
      if (dup) return Response.json({ ok: false, error: '같은 상호의 업체가 이미 있습니다: #' + dup.id + ' ' + dup.company_name, duplicate_id: dup.id }, { status: 409 });
    }
  } catch {}

  const now = kst();
  try {
    const r = await db.prepare(
      `INSERT INTO businesses (company_name, business_number, ceo_name, industry, business_type, tax_type,
                               establishment_date, address, phone, employee_count, last_revenue, vat_period,
                               notes, status, created_at, updated_at,
                               sub_business_number, corporate_number, business_category, industry_code,
                               service_type, contract_date, fiscal_year_start, fiscal_year_end, fiscal_term,
                               hr_year, company_form)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      name, bn || null, body.ceo_name || null, body.industry || null,
      body.business_type || null, body.tax_type || null,
      body.establishment_date || null, body.address || null, body.phone || null,
      body.employee_count != null && body.employee_count !== '' ? Number(body.employee_count) : null,
      body.last_revenue != null && body.last_revenue !== '' ? Number(body.last_revenue) : null,
      body.vat_period || null, body.notes || null, now, now,
      String(body.sub_business_number || '').replace(/\D/g, '') || null,
      String(body.corporate_number || '').replace(/\D/g, '') || null,
      body.business_category || null,
      body.industry_code || null,
      body.service_type || null,
      body.contract_date || null,
      body.fiscal_year_start || null,
      body.fiscal_year_end || null,
      body.fiscal_term != null && body.fiscal_term !== '' ? Number(body.fiscal_term) : null,
      body.hr_year != null && body.hr_year !== '' ? Number(body.hr_year) : null,
      body.company_form || null
    ).run();
    const bid = r.meta?.last_row_id;

    /* 🏢 auto_create_room — 업체 생성과 동시에 상담방 자동 개설 (기본 true).
       body.auto_create_room === false 면 skip. body.priority (담당자 라벨 id) 도 함께 저장. */
    let createdRoomId = null;
    if (bid && body.auto_create_room !== false) {
      try {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let rid = '';
        for (let i = 0; i < 6; i++) rid += chars[Math.floor(Math.random() * chars.length)];
        const roomName = (name + ' 상담방').slice(0, 80);
        /* priority 라벨 id 검증 (존재 확인) */
        let roomPriority = null;
        if (body.priority != null && body.priority !== '') {
          const pn = Number(body.priority);
          if (Number.isInteger(pn) && pn > 0) {
            try {
              const chk = await db.prepare(`SELECT id FROM room_labels WHERE id = ?`).bind(pn).first();
              if (chk) roomPriority = pn;
            } catch {}
          }
        }
        await db.prepare(
          `INSERT INTO chat_rooms (id, name, created_by_admin, max_members, ai_mode, status, business_id, priority, created_at)
           VALUES (?, ?, 1, 10, 'on', 'active', ?, ?, ?)`
        ).bind(rid, roomName, bid, roomPriority, now).run();
        /* 관리자(is_admin=1) 전원 자동 참여 */
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
      } catch {}
    }

    /* Q3 (2026-05-07 사장님 명령): 업체 생성 시 대표자 자동 매핑.
     * 옵션 A — body.user_id 있음 → 기존 사용자 매핑
     * 옵션 B — body.representative {real_name, birth_date?, phone?} → 신규 user 자동 INSERT + 매핑
     * 양쪽 다 business_members INSERT (is_primary=1, role='대표자') */
    let createdUserId = null;
    let mappedExistingUserId = null;
    if (bid) {
      try {
        /* users 컬럼 보장 */
        try { await db.prepare(`ALTER TABLE users ADD COLUMN provider TEXT`).run(); } catch {}
        try { await db.prepare(`ALTER TABLE users ADD COLUMN provider_user_id TEXT`).run(); } catch {}
        try { await db.prepare(`ALTER TABLE users ADD COLUMN real_name TEXT`).run(); } catch {}
        try { await db.prepare(`ALTER TABLE users ADD COLUMN phone TEXT`).run(); } catch {}
        try { await db.prepare(`ALTER TABLE users ADD COLUMN birth_date TEXT`).run(); } catch {}
        try { await db.prepare(`ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'pending'`).run(); } catch {}
        /* business_members 테이블 보장 */
        try { await db.prepare(`CREATE TABLE IF NOT EXISTS business_members (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER, user_id INTEGER, role TEXT, is_primary INTEGER DEFAULT 0, added_at TEXT, removed_at TEXT)`).run(); } catch {}

        if (body.user_id) {
          /* 옵션 A — 기존 사용자 매핑 */
          const existingUid = Number(body.user_id);
          if (Number.isInteger(existingUid) && existingUid > 0) {
            const u = await db.prepare(`SELECT id FROM users WHERE id = ?`).bind(existingUid).first();
            if (u) {
              await db.prepare(
                `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at) VALUES (?, ?, '대표자', 1, ?)`
              ).bind(bid, existingUid, now).run();
              mappedExistingUserId = existingUid;
            }
          }
        } else if (body.representative && typeof body.representative === 'object') {
          /* 옵션 B — 신규 사용자 자동 INSERT + 매핑 */
          const repName = String(body.representative.real_name || body.ceo_name || '').trim().slice(0, 50);
          const repPhone = String(body.representative.phone || '').trim().slice(0, 20);
          const repBirth = String(body.representative.birth_date || '').match(/^\d{4}-\d{2}-\d{2}$/)
            ? String(body.representative.birth_date).slice(0, 10)
            : null;
          if (repName) {
            const pseudoExt = 'admin_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const userR = await db.prepare(
              `INSERT INTO users (provider, provider_user_id, name, real_name, phone, birth_date,
                                  approval_status, approved_at, approved_by, name_confirmed,
                                  created_at, last_login_at)
               VALUES ('admin_created', ?, ?, ?, ?, ?, 'approved_client', ?, 'admin', 1, ?, NULL)`
            ).bind(pseudoExt, repName, repName, repPhone || null, repBirth, now, now).run();
            const newUid = userR.meta?.last_row_id;
            if (newUid) {
              await db.prepare(
                `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at) VALUES (?, ?, '대표자', 1, ?)`
              ).bind(bid, newUid, now).run();
              createdUserId = newUid;
            }
          }
        }
      } catch (e) {
        /* 사용자 매핑 실패해도 업체 생성은 성공 — silent */
        console.warn('[admin-businesses POST] representative mapping failed:', e.message);
      }
    }

    return Response.json({
      ok: true,
      id: bid,
      room_id: createdRoomId,
      created_user_id: createdUserId,
      mapped_user_id: mappedExistingUserId,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: 'DB error' }, { status: 500 });
  await ensureTables(db);
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ ok: false, error: 'id 필요' }, { status: 400 });
  let body = {};
  try { body = await context.request.json(); } catch { return Response.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  const existing = await db.prepare(`SELECT id FROM businesses WHERE id = ?`).bind(id).first();
  if (!existing) return Response.json({ ok: false, error: 'not found' }, { status: 404 });

  const fields = [];
  const vals = [];
  const allow = ['company_name', 'business_number', 'ceo_name', 'industry', 'business_type', 'tax_type',
    'establishment_date', 'address', 'phone', 'employee_count', 'last_revenue', 'vat_period', 'notes', 'status',
    'sub_business_number', 'corporate_number', 'business_category', 'industry_code',
    'fiscal_year_start', 'fiscal_year_end', 'fiscal_term', 'hr_year', 'company_form',
    'service_type', 'contract_date'];
  for (const k of allow) {
    if (k in body) {
      let v = body[k];
      if (k === 'business_number' || k === 'sub_business_number' || k === 'corporate_number') v = normBiz(v) || null;
      if (k === 'employee_count' || k === 'last_revenue' || k === 'fiscal_term' || k === 'hr_year') v = (v === '' || v == null) ? null : Number(v);
      fields.push(`${k} = ?`);
      vals.push(v == null || v === '' ? null : v);
    }
  }
  if (!fields.length) return Response.json({ ok: false, error: '변경 필드 없음' }, { status: 400 });
  fields.push(`updated_at = ?`);
  vals.push(kst());
  vals.push(id);
  try {
    await db.prepare(`UPDATE businesses SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  /* Phase #10 적용 (2026-05-06): 업체 삭제 = owner 전용 (cascade 메모 휴지통).
   * RBAC checkRole 사용 — 일관된 401/403 응답. */
  const authz = await checkRole(context, 'owner');
  if (!authz.ok) return roleForbidden(authz);
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: 'DB error' }, { status: 500 });
  await ensureTables(db);
  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id') || 0);
  if (!id) return Response.json({ ok: false, error: 'id 필요' }, { status: 400 });
  try {
    /* Phase M6 (2026-05-05 사장님 명령: "신중히 삭제 + 메모도 다같이 날라가는걸로"):
     * cascade soft delete — businesses + business_members + memos */

    /* lazy migration — businesses.deleted_at */
    try { await db.prepare(`ALTER TABLE businesses ADD COLUMN deleted_at TEXT`).run(); } catch (_) {}

    /* 1. 업체 정보 조회 (이름 응답용 + 존재 확인) */
    const biz = await db.prepare(
      `SELECT id, company_name FROM businesses WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')`
    ).bind(id).first();
    if (!biz) {
      return Response.json({ ok: false, error: '이미 삭제됐거나 존재하지 않는 업체' }, { status: 404 });
    }

    const now = kst();

    /* 2. business_members soft delete (removed_at) — 매핑 끊기 */
    const memberR = await db.prepare(
      `UPDATE business_members SET removed_at = ? WHERE business_id = ? AND (removed_at IS NULL OR removed_at = '')`
    ).bind(now, id).run().catch(() => null);

    /* 3. memos cascade — target_business_id = N AND 살아있는 메모 → 휴지통 */
    const memoR = await db.prepare(
      `UPDATE memos SET deleted_at = ? WHERE target_business_id = ? AND deleted_at IS NULL`
    ).bind(now, id).run().catch(() => null);

    /* 4. chat_rooms 의 business_id 매핑 해제 (방 자체는 유지) */
    try { await db.prepare(`UPDATE chat_rooms SET business_id = NULL WHERE business_id = ?`).bind(id).run(); } catch (_) {}

    /* 5. businesses 본체 — soft delete (deleted_at) + status='closed' (호환) */
    await db.prepare(
      `UPDATE businesses SET deleted_at = ?, status = 'closed', updated_at = ? WHERE id = ?`
    ).bind(now, now, id).run();

    return Response.json({
      ok: true,
      deleted_business: biz.company_name,
      cascaded_memos: memoR && memoR.meta ? (memoR.meta.changes || 0) : 0,
      removed_members: memberR && memberR.meta ? (memberR.meta.changes || 0) : 0,
      note: 'Soft delete — 메모는 휴지통에서 복원 가능 (업체 자체는 복원 X)',
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/* user dashboard 의 [+ 🏢 사업장 추가] → POST ?action=add_to_user
   1) businesses UPSERT (사업자번호 같으면 기존 id 재사용)
   2) business_members 매핑 INSERT or REVIVE
   3) is_primary=1 이면 같은 user 의 다른 매핑 모두 0
   4) biz_docs 행 보장 (서류 업로드 즉시 가능) */
async function addBusinessToUser(db, body) {
  const userId = Number(body.user_id);
  if (!userId) return Response.json({ ok: false, error: 'user_id 필요' }, { status: 400 });

  /* Phase R2-2 (M19, 2026-05-05 사장님 명령: "기존사업장 선택하는거도 만들고"):
   * body.business_id 있으면 기존 업체 직접 매핑 (company_name 검증 skip) */
  const directBizId = Number(body.business_id || 0);
  if (directBizId) {
    const u = await db.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
    if (!u) return Response.json({ ok: false, error: 'user 없음' }, { status: 404 });
    const b = await db.prepare(`SELECT id, company_name FROM businesses WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')`).bind(directBizId).first();
    if (!b) return Response.json({ ok: false, error: 'business 없음' }, { status: 404 });
    const now = kst();
    const role = ['대표자', '담당자'].includes(String(body.role || '')) ? String(body.role) : '대표자';
    const isPrimary = body.is_primary ? 1 : 0;
    const existing = await db.prepare(
      `SELECT id, removed_at FROM business_members WHERE business_id = ? AND user_id = ?`
    ).bind(directBizId, userId).first();
    if (existing) {
      await db.prepare(
        `UPDATE business_members SET removed_at = NULL, role = ?, is_primary = ? WHERE id = ?`
      ).bind(role, isPrimary, existing.id).run();
    } else {
      await db.prepare(
        `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(directBizId, userId, role, isPrimary, now).run();
    }
    if (isPrimary) {
      await db.prepare(
        `UPDATE business_members SET is_primary = 0
         WHERE user_id = ? AND business_id != ? AND (removed_at IS NULL OR removed_at = '')`
      ).bind(userId, directBizId).run();
    }
    return Response.json({ ok: true, business_id: directBizId, company_name: b.company_name, mode: 'link_existing' });
  }

  const companyName = String(body.company_name || '').trim().slice(0, 120);
  if (!companyName) return Response.json({ ok: false, error: 'company_name 필요' }, { status: 400 });
  const role = ['대표자', '담당자'].includes(String(body.role || '')) ? String(body.role) : '대표자';
  const isPrimary = body.is_primary ? 1 : 0;
  const now = kst();
  const bn = normBiz(body.business_number);
  const subBn = String(body.sub_business_number || '').replace(/\D/g, '') || null;
  const corpNo = String(body.corporate_number || '').replace(/\D/g, '') || null;
  try {
    /* user 존재 확인 */
    const u = await db.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
    if (!u) return Response.json({ ok: false, error: 'user 없음' }, { status: 404 });

    /* 1) businesses UPSERT */
    let bizId = null;
    let merged = false;
    if (bn) {
      const dup = await db.prepare(`SELECT id FROM businesses WHERE business_number = ? LIMIT 1`).bind(bn).first();
      if (dup) { bizId = dup.id; merged = true; }
    }
    if (!bizId) {
      /* 사업자번호 없으면 같은 상호 정규화 매칭으로 한 번 더 */
      const nn = normName(companyName);
      const { results: all } = await db.prepare(
        `SELECT id, company_name FROM businesses WHERE business_number IS NULL OR business_number = ''`
      ).all();
      const dup2 = (all || []).find(b => normName(b.company_name) === nn);
      if (dup2) { bizId = dup2.id; merged = true; }
    }

    if (bizId && merged) {
      /* 기존 행에 위하고 필드 채워 넣기 — 비어있는 필드만 갱신 (덮어쓰기 X) */
      await db.prepare(`UPDATE businesses SET
        ceo_name = COALESCE(NULLIF(ceo_name,''), ?),
        company_form = COALESCE(NULLIF(company_form,''), ?),
        business_category = COALESCE(NULLIF(business_category,''), ?),
        industry = COALESCE(NULLIF(industry,''), ?),
        industry_code = COALESCE(NULLIF(industry_code,''), ?),
        tax_type = COALESCE(NULLIF(tax_type,''), ?),
        address = COALESCE(NULLIF(address,''), ?),
        phone = COALESCE(NULLIF(phone,''), ?),
        sub_business_number = COALESCE(NULLIF(sub_business_number,''), ?),
        corporate_number = COALESCE(NULLIF(corporate_number,''), ?),
        establishment_date = COALESCE(NULLIF(establishment_date,''), ?),
        contract_date = COALESCE(NULLIF(contract_date,''), ?),
        fiscal_year_start = COALESCE(NULLIF(fiscal_year_start,''), ?),
        fiscal_year_end = COALESCE(NULLIF(fiscal_year_end,''), ?),
        fiscal_term = COALESCE(fiscal_term, ?),
        hr_year = COALESCE(hr_year, ?),
        notes = COALESCE(NULLIF(notes,''), ?),
        updated_at = ?
        WHERE id = ?
      `).bind(
        body.ceo_name || null,
        body.company_form || null,
        body.business_category || null,
        body.industry || null,
        body.industry_code || null,
        body.tax_type || null,
        body.address || null,
        body.phone || null,
        subBn,
        corpNo,
        body.establishment_date || null,
        body.contract_date || null,
        body.fiscal_year_start || null,
        body.fiscal_year_end || null,
        body.fiscal_term != null && body.fiscal_term !== '' ? Number(body.fiscal_term) : null,
        body.hr_year != null && body.hr_year !== '' ? Number(body.hr_year) : null,
        body.notes || null,
        now, bizId
      ).run();
    } else {
      const r = await db.prepare(
        `INSERT INTO businesses (company_name, business_number, ceo_name, industry, business_type, tax_type,
                                 establishment_date, address, phone, notes, status, created_at, updated_at,
                                 sub_business_number, corporate_number, business_category, industry_code,
                                 contract_date, fiscal_year_start, fiscal_year_end, fiscal_term, hr_year, company_form)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        companyName, bn || null, body.ceo_name || null, body.industry || null,
        body.business_type || null, body.tax_type || null,
        body.establishment_date || null, body.address || null, body.phone || null,
        body.notes || null, now, now,
        subBn, corpNo,
        body.business_category || null, body.industry_code || null,
        body.contract_date || null, body.fiscal_year_start || null, body.fiscal_year_end || null,
        body.fiscal_term != null && body.fiscal_term !== '' ? Number(body.fiscal_term) : null,
        body.hr_year != null && body.hr_year !== '' ? Number(body.hr_year) : null,
        body.company_form || null
      ).run();
      bizId = r.meta?.last_row_id;
    }

    /* 2) business_members UPSERT */
    try { await db.prepare(`CREATE TABLE IF NOT EXISTS business_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT,
      is_primary INTEGER DEFAULT 0,
      phone TEXT,
      memo TEXT,
      added_at TEXT,
      removed_at TEXT
    )`).run(); } catch {}
    try { await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bm_unique ON business_members(business_id, user_id)`).run(); } catch {}

    const existingMember = await db.prepare(
      `SELECT id, removed_at FROM business_members WHERE business_id = ? AND user_id = ? LIMIT 1`
    ).bind(bizId, userId).first();
    let memberId;
    if (existingMember) {
      await db.prepare(
        `UPDATE business_members SET role = ?, is_primary = ?, removed_at = NULL WHERE id = ?`
      ).bind(role, isPrimary, existingMember.id).run();
      memberId = existingMember.id;
    } else {
      const mr = await db.prepare(
        `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at) VALUES (?, ?, ?, ?, ?)`
      ).bind(bizId, userId, role, isPrimary, now).run();
      memberId = mr.meta?.last_row_id;
    }

    /* 3) is_primary 보정 — 같은 user 의 다른 매핑 모두 0 */
    if (isPrimary) {
      await db.prepare(
        `UPDATE business_members SET is_primary = 0 WHERE user_id = ? AND id != ?`
      ).bind(userId, memberId).run();
    }

    /* 4) biz_docs 행 보장 */
    try {
      await db.prepare(`CREATE TABLE IF NOT EXISTS biz_docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        business_id INTEGER NOT NULL,
        id_card_key TEXT,
        id_card_uploaded_at TEXT,
        biz_reg_key TEXT,
        biz_reg_uploaded_at TEXT,
        hometax_id TEXT,
        hometax_password_enc TEXT,
        hometax_updated_at TEXT,
        created_at TEXT,
        updated_at TEXT,
        UNIQUE(user_id, business_id)
      )`).run();
      await db.prepare(
        `INSERT OR IGNORE INTO biz_docs (user_id, business_id, created_at, updated_at) VALUES (?, ?, ?, ?)`
      ).bind(userId, bizId, now, now).run();
    } catch {}

    return Response.json({ ok: true, business_id: bizId, member_id: memberId, merged });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
