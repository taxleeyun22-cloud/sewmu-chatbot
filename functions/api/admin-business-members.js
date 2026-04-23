// 👥 업체 구성원(business_members) 관리
//
// role 은 '대표자' | '담당자' 두 가지. 한 사람이 여러 업체에 속할 수 있음.
//
// GET    /api/admin-business-members?key=&business_id=  → 해당 업체 구성원 목록 (+ user 정보)
// GET    /api/admin-business-members?key=&user_id=      → 이 user 가 속한 업체 전부
// POST   /api/admin-business-members?key=               body {business_id, user_id, role?, is_primary?, phone?, memo?}
// PATCH  /api/admin-business-members?key=&id=           body {role?, is_primary?, phone?, memo?}
// DELETE /api/admin-business-members?key=&id=           → removed_at 세팅 (소프트 삭제)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

const ALLOWED_ROLES = ['대표자', '담당자'];

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
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
}

export async function onRequestGet(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);
  const url = new URL(context.request.url);
  const bizId = url.searchParams.get('business_id');
  const userId = url.searchParams.get('user_id');
  const includeRemoved = url.searchParams.get('include_removed') === '1';

  if (bizId) {
    const removedCond = includeRemoved ? '' : 'AND bm.removed_at IS NULL';
    try {
      const { results } = await db.prepare(
        `SELECT bm.*, u.real_name, u.name, u.profile_image, u.approval_status, u.phone AS user_phone, u.email
           FROM business_members bm
           LEFT JOIN users u ON bm.user_id = u.id
          WHERE bm.business_id = ? ${removedCond}
          ORDER BY bm.is_primary DESC, bm.added_at ASC`
      ).bind(bizId).all();
      return Response.json({ ok: true, members: results || [] });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  if (userId) {
    try {
      const { results } = await db.prepare(
        `SELECT bm.*, b.company_name, b.business_number, b.status
           FROM business_members bm
           LEFT JOIN businesses b ON bm.business_id = b.id
          WHERE bm.user_id = ? AND bm.removed_at IS NULL
          ORDER BY bm.is_primary DESC, bm.added_at ASC`
      ).bind(userId).all();
      return Response.json({ ok: true, memberships: results || [] });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'business_id 또는 user_id 필요' }, { status: 400 });
}

export async function onRequestPost(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);
  let body = {};
  try { body = await context.request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const businessId = Number(body.business_id);
  const userId = Number(body.user_id);
  if (!businessId || !userId) return Response.json({ error: 'business_id, user_id 필요' }, { status: 400 });
  const role = ALLOWED_ROLES.includes(body.role) ? body.role : '담당자';
  const isPrimary = body.is_primary ? 1 : 0;
  const phone = String(body.phone || '').trim().replace(/[^\d\-]/g, '').slice(0, 20) || null;
  const memo = String(body.memo || '').trim().slice(0, 500) || null;
  const now = kst();

  /* 동일 (business_id, user_id) 가 removed_at 있는 상태면 복구, 없으면 신규 */
  const existing = await db.prepare(
    `SELECT id, removed_at FROM business_members WHERE business_id = ? AND user_id = ?`
  ).bind(businessId, userId).first();
  try {
    if (existing) {
      await db.prepare(
        `UPDATE business_members SET role = ?, is_primary = ?, phone = ?, memo = ?, removed_at = NULL WHERE id = ?`
      ).bind(role, isPrimary, phone, memo, existing.id).run();
      if (isPrimary) {
        /* 다른 멤버의 is_primary 해제 */
        await db.prepare(
          `UPDATE business_members SET is_primary = 0 WHERE business_id = ? AND id != ? AND is_primary = 1`
        ).bind(businessId, existing.id).run();
      }
      return Response.json({ ok: true, id: existing.id, restored: !!existing.removed_at });
    }
    if (isPrimary) {
      await db.prepare(
        `UPDATE business_members SET is_primary = 0 WHERE business_id = ? AND is_primary = 1`
      ).bind(businessId).run();
    }
    const r = await db.prepare(
      `INSERT INTO business_members (business_id, user_id, role, is_primary, phone, memo, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(businessId, userId, role, isPrimary, phone, memo, now).run();
    return Response.json({ ok: true, id: r.meta?.last_row_id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
  let body = {};
  try { body = await context.request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  const existing = await db.prepare(`SELECT business_id FROM business_members WHERE id = ?`).bind(id).first();
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 });

  const fields = [];
  const vals = [];
  if ('role' in body) {
    if (!ALLOWED_ROLES.includes(body.role)) return Response.json({ error: 'role 값 오류' }, { status: 400 });
    fields.push('role = ?'); vals.push(body.role);
  }
  if ('is_primary' in body) { fields.push('is_primary = ?'); vals.push(body.is_primary ? 1 : 0); }
  if ('phone' in body) { fields.push('phone = ?'); vals.push(String(body.phone || '').trim().replace(/[^\d\-]/g, '').slice(0, 20) || null); }
  if ('memo' in body) { fields.push('memo = ?'); vals.push(String(body.memo || '').trim().slice(0, 500) || null); }
  if (!fields.length) return Response.json({ error: '변경 필드 없음' }, { status: 400 });

  try {
    vals.push(id);
    await db.prepare(`UPDATE business_members SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    if (body.is_primary) {
      await db.prepare(
        `UPDATE business_members SET is_primary = 0 WHERE business_id = ? AND id != ? AND is_primary = 1`
      ).bind(existing.business_id, id).run();
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
  try {
    await db.prepare(`UPDATE business_members SET removed_at = ? WHERE id = ?`).bind(kst(), id).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
