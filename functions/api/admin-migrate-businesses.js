// 🔄 업체(businesses) 스키마 마이그레이션 — 일회성 실행
//
// 기존 client_businesses(user 1명이 여러 사업장 가짐) 구조를 업체 중심 모델로 전환.
// - businesses: 업체 자체 (회사명·사업자번호·대표자·업종 등)
// - business_members: 업체 소속 사람 (대표자/담당자)
// - chat_rooms.business_id: 상담방을 업체에 연결
//
// GET  /api/admin-migrate-businesses?key=              → 마이그레이션 대상 미리보기 (dry-run)
// POST /api/admin-migrate-businesses?key=&action=run
//      body {confirm:true}                              → 실제 실행
//
// 안전장치:
// - GET 은 절대 변경 안 함
// - POST 는 confirm:true 필수
// - 이미 마이그레이션된 row (businesses 에 동일 business_number 또는
//   source_client_business_id 존재) 는 skip
// - client_businesses 원본은 삭제 안 함 (레거시 유지)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

function normBiz(s) { return String(s || '').replace(/\D/g, ''); }
function normName(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

async function ensureTables(db) {
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
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_biz_number ON businesses(business_number)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_biz_name ON businesses(company_name)`).run(); } catch {}

  await db.prepare(`CREATE TABLE IF NOT EXISTS business_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT '담당자',
    is_primary INTEGER DEFAULT 0,
    phone TEXT,
    memo TEXT,
    added_at TEXT,
    removed_at TEXT,
    UNIQUE(business_id, user_id)
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_bm_business ON business_members(business_id)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_bm_user ON business_members(user_id)`).run(); } catch {}

  /* chat_rooms.business_id */
  try { await db.prepare(`ALTER TABLE chat_rooms ADD COLUMN business_id INTEGER`).run(); } catch {}
}

async function buildPlan(db) {
  await ensureTables(db);

  /* 1. 기존 client_businesses 전체 로드 */
  let legacy = [];
  try {
    const { results } = await db.prepare(
      `SELECT * FROM client_businesses ORDER BY user_id ASC, created_at ASC`
    ).all();
    legacy = results || [];
  } catch {}

  /* 2. 이미 businesses 로 이관된 것 확인 */
  const existingMigrated = new Set();
  const existingByBiz = new Map();
  const existingByName = new Map();
  try {
    const { results: already } = await db.prepare(
      `SELECT id, business_number, company_name, source_client_business_id FROM businesses`
    ).all();
    for (const b of (already || [])) {
      if (b.source_client_business_id) existingMigrated.add(b.source_client_business_id);
      const nb = normBiz(b.business_number);
      if (nb) existingByBiz.set(nb, b.id);
      const nn = normName(b.company_name);
      if (nn) existingByName.set(nn, b.id);
    }
  } catch {}

  /* 3. 각 legacy row 를 어떻게 처리할지 판정 */
  const toCreate = [];    /* 새로 businesses INSERT 대상 */
  const toLink = [];       /* 기존 businesses 로 member 만 추가할 대상 */
  const skipped = [];      /* 이미 처리된 것 */
  for (const cb of legacy) {
    if (existingMigrated.has(cb.id)) { skipped.push({ id: cb.id, reason: 'already migrated' }); continue; }
    const nb = normBiz(cb.business_number);
    const nn = normName(cb.company_name);
    let existingBid = null;
    if (nb && existingByBiz.has(nb)) existingBid = existingByBiz.get(nb);
    else if (nn && existingByName.has(nn)) existingBid = existingByName.get(nn);
    if (existingBid) {
      toLink.push({ client_business_id: cb.id, business_id: existingBid, user_id: cb.user_id });
    } else {
      toCreate.push(cb);
    }
  }

  /* 4. chat_rooms 중 business_id NULL + 멤버 중 non-admin user 가 있는 방 — 자동 연결 대상 */
  const roomsToLink = [];
  try {
    const { results: rooms } = await db.prepare(
      `SELECT id FROM chat_rooms WHERE business_id IS NULL`
    ).all();
    for (const r of (rooms || [])) {
      const member = await db.prepare(
        `SELECT user_id FROM room_members
         WHERE room_id = ? AND left_at IS NULL AND user_id IS NOT NULL AND role != 'admin'
         ORDER BY joined_at ASC LIMIT 1`
      ).bind(r.id).first();
      if (member?.user_id) roomsToLink.push({ room_id: r.id, user_id: member.user_id });
    }
  } catch {}

  return { legacyCount: legacy.length, toCreate, toLink, skipped, roomsToLink };
}

export async function onRequestGet(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  try {
    const p = await buildPlan(db);
    return Response.json({
      ok: true,
      dry_run: true,
      legacy_total: p.legacyCount,
      create_count: p.toCreate.length,
      link_existing_count: p.toLink.length,
      skipped_count: p.skipped.length,
      rooms_to_link: p.roomsToLink.length,
      sample: {
        to_create: p.toCreate.slice(0, 5).map(r => ({ id: r.id, company_name: r.company_name, business_number: r.business_number, user_id: r.user_id })),
        to_link: p.toLink.slice(0, 5),
        rooms: p.roomsToLink.slice(0, 5),
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  const url = new URL(context.request.url);
  const action = (url.searchParams.get('action') || '').trim();
  let body = {};
  try { body = await context.request.json(); } catch {}

  if (action !== 'run') return Response.json({ error: 'action=run 필요' }, { status: 400 });
  if (body.confirm !== true) return Response.json({ error: 'confirm:true 필요' }, { status: 400 });

  try {
    const p = await buildPlan(db);
    const now = kst();
    let createdBusinesses = 0;
    let createdMembers = 0;
    let linkedRooms = 0;

    /* A. 새 businesses + 대표 멤버 */
    for (const cb of p.toCreate) {
      try {
        const r = await db.prepare(
          `INSERT INTO businesses (company_name, business_number, ceo_name, industry,
                                   business_type, tax_type, establishment_date, address, phone,
                                   employee_count, last_revenue, vat_period, notes,
                                   status, source_client_business_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
        ).bind(
          cb.company_name || '무제 업체',
          normBiz(cb.business_number) || null,
          cb.ceo_name || null,
          cb.industry || null,
          cb.business_type || null,
          cb.tax_type || null,
          cb.establishment_date || null,
          cb.address || null,
          cb.phone || null,
          cb.employee_count || null,
          cb.last_revenue || null,
          cb.vat_period || null,
          cb.notes || null,
          cb.id,
          cb.created_at || now, now
        ).run();
        const bid = r.meta?.last_row_id;
        if (bid && cb.user_id) {
          try {
            await db.prepare(
              `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at)
               VALUES (?, ?, '대표자', 1, ?)`
            ).bind(bid, cb.user_id, now).run();
            createdMembers++;
          } catch {}
        }
        createdBusinesses++;
      } catch { /* skip 실패 row */ }
    }

    /* B. 기존 businesses 로 멤버만 추가 */
    for (const link of p.toLink) {
      try {
        await db.prepare(
          `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at)
           VALUES (?, ?, '담당자', 0, ?)
           ON CONFLICT(business_id, user_id) DO NOTHING`
        ).bind(link.business_id, link.user_id, now).run();
        createdMembers++;
      } catch { /* unique 충돌은 skip */ }
    }

    /* C. chat_rooms.business_id 자동 연결 — user 의 대표 업체로 */
    for (const rl of p.roomsToLink) {
      try {
        const bm = await db.prepare(
          `SELECT business_id FROM business_members
           WHERE user_id = ? AND removed_at IS NULL
           ORDER BY is_primary DESC, id ASC LIMIT 1`
        ).bind(rl.user_id).first();
        if (bm?.business_id) {
          await db.prepare(
            `UPDATE chat_rooms SET business_id = ? WHERE id = ? AND business_id IS NULL`
          ).bind(bm.business_id, rl.room_id).run();
          linkedRooms++;
        }
      } catch {}
    }

    return Response.json({
      ok: true,
      executed_at: now,
      created_businesses: createdBusinesses,
      created_members: createdMembers,
      linked_rooms: linkedRooms,
      legacy_total: p.legacyCount,
      note: 'client_businesses 원본은 유지됨 (레거시 호환)',
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
