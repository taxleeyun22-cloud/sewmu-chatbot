// 관리자 사용자 리스트
import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";
import { checkRole, roleForbidden } from "./_authz.js";

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();

  const url = new URL(context.request.url);
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  // is_admin / staff_role 컬럼 보장
  try { await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN staff_role TEXT`).run(); } catch {}

  /* @멘션용 간이 스태프 리스트 — is_admin=1 만 반환 (id, name) */
  const action = url.searchParams.get("action");
  if (action === "staff_list") {
    try {
      const { results } = await db.prepare(
        `SELECT id, COALESCE(real_name, name, 'ID#'||id) AS display_name, is_admin
         FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 50`
      ).all();
      return Response.json({ ok: true, staff: results || [] });
    } catch (e) {
      return Response.json({ ok: true, staff: [] });
    }
  }

  const search = (url.searchParams.get("search") || "").trim();
  const sort = url.searchParams.get("sort") || "recent"; // recent/joined/messages
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 30;
  const offset = (page - 1) * limit;

  try {
    let whereClause = "1=1";
    const params = [];
    if (search) {
      whereClause += " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    let orderBy = "u.last_login_at DESC";
    if (sort === "joined") orderBy = "u.created_at DESC";
    if (sort === "messages") orderBy = "message_count DESC";

    const query = `
      SELECT
        u.id, u.provider, u.name, u.email, u.phone, u.profile_image, u.is_admin, u.staff_role,
        u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) as message_count,
        (SELECT MAX(created_at) FROM conversations c WHERE c.user_id = u.id) as last_message_at
      FROM users u
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const { results } = await db.prepare(query).bind(...params).all();
    const countR = await db.prepare(`SELECT COUNT(*) as n FROM users`).first();

    return Response.json({
      users: results || [],
      total: countR?.n || 0,
      page,
      totalPages: Math.ceil((countR?.n || 0) / limit),
      caller_owner: !!auth.owner,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin-users?action=set_admin { user_id, is_admin: 0|1 }
//      /api/admin-users?action=set_staff_role { user_id, staff_role: 'manager'|'staff'|null }
// 사장님(owner)만 다른 사용자의 is_admin / staff_role 플래그 변경 가능.
// Phase #10 적용 (2026-05-06): _authz.js checkRole('owner') 사용 — 통일된 에러 응답.
export async function onRequestPost(context) {
  const authz = await checkRole(context, 'owner');
  if (!authz.ok) return roleForbidden(authz);

  const url = new URL(context.request.url);
  const action = url.searchParams.get("action");
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  try { await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run(); } catch {}

  let body = {};
  try { body = await context.request.json(); } catch {}

  if (action === "set_admin") {
    const userId = Number(body.user_id);
    const isAdmin = body.is_admin === 1 || body.is_admin === true ? 1 : 0;
    if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
    try {
      await db.prepare(`UPDATE users SET is_admin = ? WHERE id = ?`).bind(isAdmin, userId).run();
      /* 승급(1)이면 기존 활성 방 전체에 자동 참여 — 카톡 그룹방 스타일 통일.
         강등(0)이면 강제 참여로 'admin' 박혔던 멤버십을 'member' 로 환원 —
         my-rooms.js '내 상담방' 필터에 막혀 기장거래처 전환 후 빈 화면 나는 버그 방지. */
      let addedRooms = 0;
      let demotedMemberships = 0;
      if (isAdmin === 0) {
        try {
          const r = await db.prepare(
            `UPDATE room_members SET role = 'member'
             WHERE user_id = ? AND role = 'admin' AND left_at IS NULL`
          ).bind(userId).run();
          demotedMemberships = r?.meta?.changes || 0;
        } catch {}
        /* Phase M13 (2026-05-05 사장님 명령: "자동참여인데 내가 관리자 해지하면 없어져야됨"):
         * is_admin=0 강등 시 internal 방 (is_internal=1) 에서는 강제 퇴장 (left_at = now).
         * 보안 — 강등된 직원이 관리자방 메시지 계속 보면 안 됨. */
        try {
          const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
          await db.prepare(`
            UPDATE room_members SET left_at = ?
            WHERE user_id = ?
              AND room_id IN (SELECT id FROM chat_rooms WHERE is_internal = 1)
              AND left_at IS NULL
          `).bind(now, userId).run();
        } catch {}
      }
      if (isAdmin === 1) {
        try {
          const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
          const { results: rooms } = await db.prepare(
            `SELECT id FROM chat_rooms WHERE status = 'active'`
          ).all();
          for (const r of (rooms || [])) {
            try {
              const existing = await db.prepare(
                `SELECT user_id, left_at FROM room_members WHERE room_id = ? AND user_id = ?`
              ).bind(r.id, userId).first();
              if (existing) {
                if (existing.left_at) {
                  await db.prepare(
                    `UPDATE room_members SET role = 'admin', left_at = NULL WHERE room_id = ? AND user_id = ?`
                  ).bind(r.id, userId).run();
                  addedRooms++;
                } else {
                  /* 이미 참여 중이면 역할만 admin 으로 승격 */
                  await db.prepare(
                    `UPDATE room_members SET role = 'admin' WHERE room_id = ? AND user_id = ?`
                  ).bind(r.id, userId).run();
                }
              } else {
                await db.prepare(
                  `INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)`
                ).bind(r.id, userId, now).run();
                addedRooms++;
              }
            } catch { /* 방별 실패는 계속 진행 */ }
          }
        } catch {}
      }
      return Response.json({ ok: true, user_id: userId, is_admin: isAdmin, added_rooms: addedRooms, demoted_memberships: demotedMemberships });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* Phase #10 적용 (2026-05-06): RBAC manager / staff 등급 부여.
   * action=set_staff_role { user_id, staff_role: 'manager' | 'staff' | null }
   * - owner only (사장님만 직원 등급 변경 가능)
   * - is_admin=1 사용자만 대상 (일반 거래처는 admin 권한 0 이라 manager 부여 무의미)
   * - manager 부여 시 _authz.js checkRole('manager') 통과
   * - staff (default) — 단순 admin 권한만
   */
  if (action === "set_staff_role") {
    const userId = Number(body.user_id);
    let role = body.staff_role;
    if (role !== 'manager' && role !== 'staff' && role !== null) {
      return Response.json({ error: "staff_role must be 'manager' | 'staff' | null" }, { status: 400 });
    }
    if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
    try {
      try { await db.prepare(`ALTER TABLE users ADD COLUMN staff_role TEXT`).run(); } catch {}
      /* is_admin=1 인 사용자만 — manager 부여는 admin 권한 위 단계 */
      const u = await db.prepare(`SELECT id, is_admin FROM users WHERE id = ?`).bind(userId).first();
      if (!u) return Response.json({ error: "user not found" }, { status: 404 });
      if (!u.is_admin && role) {
        return Response.json({ error: "admin 권한이 없는 사용자에게는 staff_role 부여 불가 (먼저 set_admin)" }, { status: 400 });
      }
      await db.prepare(`UPDATE users SET staff_role = ? WHERE id = ?`).bind(role, userId).run();
      return Response.json({ ok: true, user_id: userId, staff_role: role });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* Phase P2 (2026-05-07 사장님 명령): 카카오 닉네임 / 실명 수정.
   * action=update_name { user_id, name?, real_name?, phone?, birth_date? }
   * - 카카오 가입자: 카톡 닉네임이 가명일 수 있음 → 사장님이 진짜 이름으로 수정 가능
   * - admin (any) — 단순 정보 업데이트 (권한 변경 X) */
  if (action === "update_name") {
    const userId = Number(body.user_id);
    if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
    const updates = [];
    const binds = [];
    if (typeof body.name === 'string') {
      updates.push('name = ?');
      binds.push(String(body.name).trim().slice(0, 50));
    }
    if (typeof body.real_name === 'string') {
      updates.push('real_name = ?');
      binds.push(String(body.real_name).trim().slice(0, 50) || null);
    }
    if (typeof body.phone === 'string') {
      updates.push('phone = ?');
      binds.push(String(body.phone).trim().slice(0, 20) || null);
    }
    if (typeof body.birth_date === 'string') {
      const m = body.birth_date.match(/^\d{4}-\d{2}-\d{2}$/);
      updates.push('birth_date = ?');
      binds.push(m ? body.birth_date : null);
    }
    if (typeof body.name_confirmed === 'number' || typeof body.name_confirmed === 'boolean') {
      updates.push('name_confirmed = ?');
      binds.push(body.name_confirmed ? 1 : 0);
    }
    if (!updates.length) return Response.json({ error: "no fields to update" }, { status: 400 });
    try {
      try { await db.prepare(`ALTER TABLE users ADD COLUMN birth_date TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN name_confirmed INTEGER DEFAULT 0`).run(); } catch {}
      binds.push(userId);
      await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
      return Response.json({ ok: true, user_id: userId });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* Phase P1 (2026-05-07 사장님 명령): 카카오 가입자 승인 시 기존 사용자 매핑 복사.
   * action=merge_mappings { from_user_id, to_user_id }
   * - from_user_id 의 business_members 매핑 → to_user_id 에 복사
   * - 보통: from = 기존 수동 user, to = 새 카카오 가입자
   * - 매핑만 복사 (메모 / 메시지 / 등 데이터 이전 X — 별도 endpoint)
   * - admin (any) */
  if (action === "merge_mappings") {
    const fromId = Number(body.from_user_id);
    const toId = Number(body.to_user_id);
    if (!fromId || !toId) return Response.json({ error: "from_user_id/to_user_id required" }, { status: 400 });
    if (fromId === toId) return Response.json({ error: "same user" }, { status: 400 });
    try {
      try { await db.prepare(`CREATE TABLE IF NOT EXISTS business_members (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER, user_id INTEGER, role TEXT, is_primary INTEGER DEFAULT 0, added_at TEXT, removed_at TEXT)`).run(); } catch {}
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
      const { results: rows } = await db.prepare(
        `SELECT business_id, role, is_primary FROM business_members WHERE user_id = ? AND (removed_at IS NULL OR removed_at = '')`
      ).bind(fromId).all();
      let copied = 0;
      for (const r of (rows || [])) {
        /* to_user_id 가 같은 business_id 매핑 이미 있으면 skip */
        const existing = await db.prepare(
          `SELECT id FROM business_members WHERE user_id = ? AND business_id = ? AND (removed_at IS NULL OR removed_at = '') LIMIT 1`
        ).bind(toId, r.business_id).first();
        if (existing) continue;
        await db.prepare(
          `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at) VALUES (?, ?, ?, ?, ?)`
        ).bind(r.business_id, toId, r.role || '대표자', r.is_primary || 0, now).run();
        copied++;
      }
      return Response.json({ ok: true, copied, from_user_id: fromId, to_user_id: toId });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
