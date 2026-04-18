// 관리자: 사용자 승인/거절/기장승인 관리
const APPROVAL_STATUSES = ['pending', 'approved_client', 'approved_guest', 'rejected'];

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

async function ensureColumns(db) {
  const addCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await addCol(`ALTER TABLE users ADD COLUMN real_name TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'pending'`);
  await addCol(`ALTER TABLE users ADD COLUMN approved_at TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN approved_by TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN rejection_reason TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN name_confirmed INTEGER DEFAULT 0`);
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS daily_usage (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, date)
    )`).run();
  } catch {}
}

// GET: 승인상태별 사용자 목록
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureColumns(db);
  try { await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run(); } catch {}

  const status = url.searchParams.get("status");
  try {
    let query = `
      SELECT id, provider, name, real_name, email, phone, profile_image,
             approval_status, approved_at, created_at, last_login_at, name_confirmed, is_admin
      FROM users
    `;
    const binds = [];
    if (status && status !== 'all' && APPROVAL_STATUSES.includes(status)) {
      query += ` WHERE COALESCE(approval_status, 'pending') = ?`;
      binds.push(status);
    }
    query += ` ORDER BY created_at DESC LIMIT 200`;

    const { results } = await db.prepare(query).bind(...binds).all();

    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const u of results) {
      try {
        const usage = await db.prepare(
          `SELECT count FROM daily_usage WHERE user_id = ? AND date = ?`
        ).bind(u.id, today).first();
        u.today_count = usage ? usage.count : 0;
      } catch { u.today_count = 0; }
    }

    const counts = {};
    for (const s of APPROVAL_STATUSES) {
      const r = await db.prepare(
        `SELECT COUNT(*) as c FROM users WHERE COALESCE(approval_status, 'pending') = ?`
      ).bind(s).first();
      counts[s] = r?.c || 0;
    }

    return Response.json({ users: results, counts });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST: 승인 처리
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureColumns(db);

  try {
    const body = await context.request.json();
    const userId = body.user_id;
    const action = body.action;
    const reason = body.reason || null;

    if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

    let newStatus;
    if (action === 'approve_client') newStatus = 'approved_client';
    else if (action === 'approve_guest') newStatus = 'approved_guest';
    else if (action === 'reject') newStatus = 'rejected';
    else if (action === 'pending') newStatus = 'pending';
    else return Response.json({ error: "invalid action" }, { status: 400 });

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    await db.prepare(
      `UPDATE users SET approval_status = ?, approved_at = ?, approved_by = 'admin', rejection_reason = ? WHERE id = ?`
    ).bind(newStatus, kst, reason, userId).run();

    return Response.json({ ok: true, status: newStatus });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
