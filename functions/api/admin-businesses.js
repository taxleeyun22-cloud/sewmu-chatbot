// 🏢 업체(businesses) 관리 — 최상위 거래처 엔티티
//
// GET    /api/admin-businesses?key=                → 업체 목록 (검색·상태 필터)
//        &search= &status=active|closed|terminated
// GET    /api/admin-businesses?key=&id=            → 단건 + 구성원 + 연결된 상담방
// POST   /api/admin-businesses?key=                → 신규 생성 (중복 방지 UPSERT 아님, 중복 감지 후 400)
// PUT    /api/admin-businesses?key=&id=            → 수정
// DELETE /api/admin-businesses?key=&id=            → 삭제 (owner 전용, 연결된 구성원·상담방 해제)

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";

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
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const search = (url.searchParams.get('search') || '').trim();
  const status = (url.searchParams.get('status') || '').trim();

  if (id) {
    try {
      const biz = await db.prepare(`SELECT * FROM businesses WHERE id = ?`).bind(id).first();
      if (!biz) return Response.json({ error: 'not found' }, { status: 404 });
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
      return Response.json({ error: e.message }, { status: 500 });
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
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTables(db);
  let body = {};
  try { body = await context.request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const name = String(body.company_name || '').trim().slice(0, 120);
  if (!name) return Response.json({ error: 'company_name 필요' }, { status: 400 });
  const bn = normBiz(body.business_number);

  /* 중복 감지 — 사업자번호 우선, 없으면 상호 정규화 */
  try {
    if (bn) {
      const dup = await db.prepare(`SELECT id, company_name FROM businesses WHERE business_number = ? LIMIT 1`).bind(bn).first();
      if (dup) return Response.json({ error: '같은 사업자번호의 업체가 이미 있습니다: #' + dup.id + ' ' + dup.company_name, duplicate_id: dup.id }, { status: 409 });
    } else {
      const nn = normName(name);
      const { results: all } = await db.prepare(`SELECT id, company_name FROM businesses WHERE business_number IS NULL OR business_number = ''`).all();
      const dup = (all || []).find(b => normName(b.company_name) === nn);
      if (dup) return Response.json({ error: '같은 상호의 업체가 이미 있습니다: #' + dup.id + ' ' + dup.company_name, duplicate_id: dup.id }, { status: 409 });
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
       body.auto_create_room === false 면 skip. 대표자 있으면 is_primary user 를 room_members 에 */
    let createdRoomId = null;
    if (bid && body.auto_create_room !== false) {
      try {
        /* 방 id — 6자리 영숫자 */
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let rid = '';
        for (let i = 0; i < 6; i++) rid += chars[Math.floor(Math.random() * chars.length)];
        const roomName = (name + ' 상담방').slice(0, 80);
        await db.prepare(
          `INSERT INTO chat_rooms (id, name, created_by_admin, max_members, ai_mode, status, business_id, created_at)
           VALUES (?, ?, 1, 10, 'on', 'active', ?, ?)`
        ).bind(rid, roomName, bid, now).run();
        /* 관리자(is_admin=1) 전원 자동 참여 — 다른 방 생성 경로와 통일 */
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

    return Response.json({ ok: true, id: bid, room_id: createdRoomId });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTables(db);
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
  let body = {};
  try { body = await context.request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const existing = await db.prepare(`SELECT id FROM businesses WHERE id = ?`).bind(id).first();
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 });

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
  if (!fields.length) return Response.json({ error: '변경 필드 없음' }, { status: 400 });
  fields.push(`updated_at = ?`);
  vals.push(kst());
  vals.push(id);
  try {
    await db.prepare(`UPDATE businesses SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTables(db);
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
  try {
    /* 연결 해제 + 소프트 삭제 대신 status='closed' 로만 */
    await db.prepare(`UPDATE businesses SET status = 'closed', updated_at = ? WHERE id = ?`).bind(kst(), id).run();
    /* 멤버는 유지 (소속 기록), 상담방 연결도 유지 — 필요 시 수동 해제 */
    return Response.json({ ok: true, note: '실제 삭제는 하지 않음. status=closed 로만 변경.' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
