// 상담방 담당자 라벨 (우선순위·담당자 구분용 · 관리자 직접 편집)
// 기존 chat_rooms.priority INTEGER 를 재해석:
//   - priority 값이 room_labels.id 를 가리키는 외래키 (정규화 X, lazy)
//   - 과거 priority=1/2/3 → 자동으로 "1순위/2순위/3순위" 라벨로 seed
//
// API:
// - GET    /api/admin-room-labels            → 전체 라벨 리스트 (sort_order ASC)
// - POST   /api/admin-room-labels            → 새 라벨 { name, color?, sort_order? }
// - PATCH  /api/admin-room-labels?id=N       → 수정 { name?, color?, sort_order?, active? }
// - DELETE /api/admin-room-labels?id=N       → 삭제 (사용중이면 거부, 강제 옵션: ?force=1 → 방 priority=NULL 처리)
//
// 인증: checkAdmin (ADMIN_KEY or 스태프 세션)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS room_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6b7280',
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
  )`).run();
  /* 최초 시드 — 기존 1/2/3 데이터와 호환 */
  try {
    const cnt = await db.prepare(`SELECT COUNT(*) AS c FROM room_labels`).first();
    if ((cnt?.c || 0) === 0) {
      const now = kst();
      /* id 를 1,2,3 로 강제 — 기존 chat_rooms.priority=1/2/3 호환 */
      await db.prepare(`INSERT INTO room_labels (id, name, color, sort_order, active, created_at) VALUES (1, '1순위', '#dc2626', 1, 1, ?)`).bind(now).run();
      await db.prepare(`INSERT INTO room_labels (id, name, color, sort_order, active, created_at) VALUES (2, '2순위', '#f59e0b', 2, 1, ?)`).bind(now).run();
      await db.prepare(`INSERT INTO room_labels (id, name, color, sort_order, active, created_at) VALUES (3, '3순위', '#10b981', 3, 1, ?)`).bind(now).run();
    }
  } catch {}
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  try {
    const { results } = await db.prepare(
      `SELECT id, name, color, sort_order, active FROM room_labels
       ORDER BY sort_order ASC, id ASC`
    ).all();
    return Response.json({ ok: true, labels: results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const name = String(body.name || '').trim().slice(0, 30);
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#6b7280';
  if (!name) return Response.json({ error: "name required" }, { status: 400 });

  /* sort_order: 명시 없으면 최대값+1 */
  let sortOrder = Number(body.sort_order || 0);
  if (!sortOrder) {
    try {
      const m = await db.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM room_labels`).first();
      sortOrder = (m?.m || 0) + 1;
    } catch { sortOrder = 99; }
  }
  const now = kst();
  try {
    const r = await db.prepare(
      `INSERT INTO room_labels (name, color, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    ).bind(name, color, sortOrder, now, now).run();
    return Response.json({ ok: true, id: r.meta?.last_row_id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get("id") || 0);
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const fields = [], binds = [];
  if (body.name !== undefined) {
    const n = String(body.name || '').trim().slice(0, 30);
    if (!n) return Response.json({ error: "name empty" }, { status: 400 });
    fields.push('name = ?'); binds.push(n);
  }
  if (body.color !== undefined) {
    const c = /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#6b7280';
    fields.push('color = ?'); binds.push(c);
  }
  if (body.sort_order !== undefined) {
    const s = Number(body.sort_order);
    if (!Number.isFinite(s)) return Response.json({ error: "invalid sort_order" }, { status: 400 });
    fields.push('sort_order = ?'); binds.push(s);
  }
  if (body.active !== undefined) {
    fields.push('active = ?'); binds.push(body.active ? 1 : 0);
  }
  if (!fields.length) return Response.json({ error: "nothing to update" }, { status: 400 });
  fields.push('updated_at = ?'); binds.push(kst());
  binds.push(id);

  try {
    await db.prepare(`UPDATE room_labels SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get("id") || 0);
  const force = url.searchParams.get("force") === '1';
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  try {
    /* 사용중 체크 */
    const usage = await db.prepare(`SELECT COUNT(*) AS c FROM chat_rooms WHERE priority = ?`).bind(id).first();
    const cnt = usage?.c || 0;
    if (cnt > 0 && !force) {
      return Response.json({
        error: `사용중인 라벨: ${cnt}개 방이 이 담당자로 지정됨. 삭제하려면 force=1`,
        in_use: cnt,
      }, { status: 409 });
    }
    /* force: 해당 방 priority NULL 처리 */
    if (cnt > 0 && force) {
      try { await db.prepare(`UPDATE chat_rooms SET priority = NULL WHERE priority = ?`).bind(id).run(); } catch {}
    }
    await db.prepare(`DELETE FROM room_labels WHERE id = ?`).bind(id).run();
    return Response.json({ ok: true, cleared_rooms: cnt });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
