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
    /* 사장님 명령 (2026-05-07): 본인 제출 회사정보도 수정 가능 */
    if (typeof body.requested_company_name === 'string' || body.requested_company_name === null) {
      updates.push('requested_company_name = ?');
      binds.push(body.requested_company_name ? String(body.requested_company_name).trim().slice(0, 100) : null);
    }
    if (typeof body.requested_business_number === 'string' || body.requested_business_number === null) {
      updates.push('requested_business_number = ?');
      binds.push(body.requested_business_number ? String(body.requested_business_number).trim().replace(/\D/g, '').slice(0, 12) : null);
    }
    if (typeof body.requested_role === 'string' || body.requested_role === null) {
      updates.push('requested_role = ?');
      binds.push(body.requested_role ? String(body.requested_role).trim().slice(0, 20) : null);
    }
    if (!updates.length) return Response.json({ error: "no fields to update" }, { status: 400 });
    try {
      try { await db.prepare(`ALTER TABLE users ADD COLUMN birth_date TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN name_confirmed INTEGER DEFAULT 0`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN requested_company_name TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN requested_business_number TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN requested_role TEXT`).run(); } catch {}
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

  /* Phase (2026-05-07 사장님 명령 정정): 진짜 merge — 카카오 가입자와 수동 user 합치기.
   * action=merge_users { kakao_user_id, manual_user_id }
   * 결과: manual_user 가 살아남음. kakao_user 의 카카오 정보 (provider/provider_user_id/profile_image)
   * 를 manual_user 에 흡수 + kakao_user 는 deleted_at = now (archive).
   * 모든 매핑·메모·메시지·등 → manual_user 로 이전.
   * - admin-users.js onRequestPost owner 가드 통과 후 (전체 함수 owner only) */
  if (action === "merge_users") {
    const kakaoUid = Number(body.kakao_user_id);
    const manualUid = Number(body.manual_user_id);
    if (!kakaoUid || !manualUid) return Response.json({ error: "kakao_user_id/manual_user_id required" }, { status: 400 });
    if (kakaoUid === manualUid) return Response.json({ error: "same user" }, { status: 400 });
    try {
      try { await db.prepare(`ALTER TABLE users ADD COLUMN provider TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN provider_user_id TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN profile_image TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN deleted_at TEXT`).run(); } catch {}

      /* 사장님 명령 (2026-05-07): user_merges audit log — 분리 시 원상복구 위해.
       * snapshot 만 저장. 데이터는 admin user 에 그대로 (사장님 워크플로). */
      try { await db.prepare(`CREATE TABLE IF NOT EXISTS user_merges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manual_user_id INTEGER NOT NULL,
        kakao_user_id INTEGER NOT NULL,
        kakao_snapshot TEXT,
        manual_snapshot TEXT,
        merged_at TEXT,
        merged_by_admin TEXT,
        unmerged_at TEXT,
        unmerged_by_admin TEXT
      )`).run(); } catch {}

      const kakao = await db.prepare(`SELECT id, provider, provider_user_id, name, profile_image, email, phone, approval_status FROM users WHERE id = ?`).bind(kakaoUid).first();
      const manual = await db.prepare(`SELECT id, real_name, provider, provider_user_id, profile_image, email, approval_status FROM users WHERE id = ?`).bind(manualUid).first();
      if (!kakao || !manual) return Response.json({ error: "user not found" }, { status: 404 });

      const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
      const stats = { mappings: 0, memos: 0, conversations: 0, room_members: 0, documents: 0 };

      /* 0. snapshot 저장 — 분리 시 원상복구용 */
      const kakaoSnapshot = JSON.stringify({
        provider: kakao.provider, provider_user_id: kakao.provider_user_id,
        name: kakao.name, profile_image: kakao.profile_image,
        email: kakao.email, phone: kakao.phone,
        approval_status: kakao.approval_status,
      });
      const manualSnapshot = JSON.stringify({
        provider: manual.provider, provider_user_id: manual.provider_user_id,
        approval_status: manual.approval_status,
        profile_image: manual.profile_image, email: manual.email,
      });
      let mergeAuditId = null;
      try {
        const mr = await db.prepare(`INSERT INTO user_merges (manual_user_id, kakao_user_id, kakao_snapshot, manual_snapshot, merged_at, merged_by_admin) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(manualUid, kakaoUid, kakaoSnapshot, manualSnapshot, now, (auth && auth.role) || 'admin').run();
        mergeAuditId = mr.meta?.last_row_id || null;
      } catch (e) {
        /* audit 실패해도 합치기는 진행 — silent */
      }

      /* 1. 카카오 정보 → manual user 흡수 */
      await db.prepare(`
        UPDATE users SET
          provider = ?,
          provider_user_id = ?,
          profile_image = COALESCE(?, profile_image),
          name = COALESCE(?, name),
          email = COALESCE(?, email),
          phone = COALESCE(phone, ?),
          name_confirmed = 1,
          approval_status = 'approved_client',
          approved_at = COALESCE(approved_at, ?),
          last_login_at = ?
        WHERE id = ?
      `).bind(
        kakao.provider, kakao.provider_user_id, kakao.profile_image,
        kakao.name, kakao.email, kakao.phone, now, now, manualUid
      ).run();

      /* 2. 매핑 / 데이터 이전 — kakao_user_id → manual_user_id */
      try {
        const r1 = await db.prepare(`UPDATE business_members SET user_id = ? WHERE user_id = ? AND (removed_at IS NULL OR removed_at = '')`).bind(manualUid, kakaoUid).run();
        stats.mappings = r1?.meta?.changes || 0;
      } catch {}
      try {
        const r2 = await db.prepare(`UPDATE memos SET target_user_id = ? WHERE target_user_id = ?`).bind(manualUid, kakaoUid).run();
        stats.memos += r2?.meta?.changes || 0;
      } catch {}
      try {
        const r3 = await db.prepare(`UPDATE memos SET author_user_id = ? WHERE author_user_id = ?`).bind(manualUid, kakaoUid).run();
        stats.memos += r3?.meta?.changes || 0;
      } catch {}
      try {
        const r4 = await db.prepare(`UPDATE conversations SET user_id = ? WHERE user_id = ?`).bind(manualUid, kakaoUid).run();
        stats.conversations = r4?.meta?.changes || 0;
      } catch {}
      try {
        const r5 = await db.prepare(`UPDATE room_members SET user_id = ? WHERE user_id = ? AND (left_at IS NULL OR left_at = '')`).bind(manualUid, kakaoUid).run();
        stats.room_members = r5?.meta?.changes || 0;
      } catch {}
      try {
        const r6 = await db.prepare(`UPDATE documents SET user_id = ? WHERE user_id = ?`).bind(manualUid, kakaoUid).run();
        stats.documents = r6?.meta?.changes || 0;
      } catch {}
      /* daily_usage / sessions / 기타 작은 테이블도 — fail silent */
      try { await db.prepare(`UPDATE daily_usage SET user_id = ? WHERE user_id = ?`).bind(manualUid, kakaoUid).run(); } catch {}
      try { await db.prepare(`UPDATE sessions SET user_id = ? WHERE user_id = ?`).bind(manualUid, kakaoUid).run(); } catch {}
      try { await db.prepare(`UPDATE business_documents SET user_id = ? WHERE user_id = ?`).bind(manualUid, kakaoUid).run(); } catch {}

      /* 3. kakao user archive */
      await db.prepare(`UPDATE users SET deleted_at = ?, approval_status = 'merged', provider = 'merged', provider_user_id = NULL WHERE id = ?`)
        .bind(now, kakaoUid).run();

      return Response.json({
        ok: true,
        survived_user_id: manualUid,
        archived_user_id: kakaoUid,
        survived_real_name: manual.real_name,
        moved: stats,
        merge_id: mergeAuditId,
      });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* 사장님 명령 (2026-05-07): 합치기 분리 (merge undo).
   * action=split_users { merge_id }
   * - user_merges row 의 snapshot 으로 카카오 user 복원 (대기 상태) + admin user 복원 (기장거래처)
   * - 데이터는 admin user 에 그대로 남음 (사장님 워크플로 — admin 이 진짜 데이터 보유자)
   * - owner only */
  if (action === "split_users") {
    const mergeId = Number(body.merge_id);
    if (!mergeId) return Response.json({ error: "merge_id required" }, { status: 400 });
    try {
      const merge = await db.prepare(`SELECT * FROM user_merges WHERE id = ? AND (unmerged_at IS NULL OR unmerged_at = '')`).bind(mergeId).first();
      if (!merge) return Response.json({ error: "merge not found or already split" }, { status: 404 });

      const kakaoSnap = JSON.parse(merge.kakao_snapshot || '{}');
      const manualSnap = JSON.parse(merge.manual_snapshot || '{}');
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

      /* 1. 카카오 user 복원 — 대기 상태 (OAuth 정보 그대로) */
      await db.prepare(`UPDATE users SET
        deleted_at = NULL,
        provider = ?,
        provider_user_id = ?,
        name = ?,
        profile_image = ?,
        email = ?,
        phone = ?,
        approval_status = ?,
        name_confirmed = 0
        WHERE id = ?`).bind(
        kakaoSnap.provider || 'kakao',
        kakaoSnap.provider_user_id || null,
        kakaoSnap.name || null,
        kakaoSnap.profile_image || null,
        kakaoSnap.email || null,
        kakaoSnap.phone || null,
        kakaoSnap.approval_status || 'pending',
        merge.kakao_user_id
      ).run();

      /* 2. admin user 복원 — 카카오 정보 떼어내고 원래 provider 로 */
      await db.prepare(`UPDATE users SET
        provider = ?,
        provider_user_id = ?,
        approval_status = ?,
        profile_image = ?,
        email = ?
        WHERE id = ?`).bind(
        manualSnap.provider || 'admin_created',
        manualSnap.provider_user_id || null,
        manualSnap.approval_status || 'approved_client',
        manualSnap.profile_image || null,
        manualSnap.email || null,
        merge.manual_user_id
      ).run();

      /* 3. user_merges.unmerged_at = now */
      await db.prepare(`UPDATE user_merges SET unmerged_at = ?, unmerged_by_admin = ? WHERE id = ?`)
        .bind(now, (auth && auth.role) || 'admin', mergeId).run();

      return Response.json({
        ok: true,
        kakao_user_id: merge.kakao_user_id,
        manual_user_id: merge.manual_user_id,
      });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* 사장님 명령 (2026-05-07): 합치기 이력 조회.
   * action=get_merges { user_id?, all? }
   * - user_id 있으면: 그 살아남은 user 의 활성 merge (배너용)
   * - user_id 없거나 all=1: 모든 활성 merge (사이드바 list 용) */
  if (action === "get_merges") {
    const userId = Number(body.user_id || 0);
    const all = !!body.all || !userId;
    try {
      try { await db.prepare(`CREATE TABLE IF NOT EXISTS user_merges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manual_user_id INTEGER NOT NULL,
        kakao_user_id INTEGER NOT NULL,
        kakao_snapshot TEXT,
        manual_snapshot TEXT,
        merged_at TEXT,
        merged_by_admin TEXT,
        unmerged_at TEXT,
        unmerged_by_admin TEXT
      )`).run(); } catch {}
      let results;
      if (all) {
        const r = await db.prepare(`
          SELECT um.id, um.manual_user_id, um.kakao_user_id, um.merged_at, um.kakao_snapshot,
                 mu.real_name AS manual_real_name, mu.name AS manual_name
          FROM user_merges um
          LEFT JOIN users mu ON um.manual_user_id = mu.id
          WHERE (um.unmerged_at IS NULL OR um.unmerged_at = '')
          ORDER BY um.merged_at DESC
          LIMIT 200
        `).all();
        results = r.results;
      } else {
        const r = await db.prepare(`
          SELECT um.id, um.manual_user_id, um.kakao_user_id, um.merged_at, um.kakao_snapshot,
                 mu.real_name AS manual_real_name, mu.name AS manual_name
          FROM user_merges um
          LEFT JOIN users mu ON um.manual_user_id = mu.id
          WHERE um.manual_user_id = ? AND (um.unmerged_at IS NULL OR um.unmerged_at = '')
          ORDER BY um.merged_at DESC
        `).bind(userId).all();
        results = r.results;
      }
      const merges = (results || []).map(m => {
        let kakaoName = '';
        try {
          const snap = JSON.parse(m.kakao_snapshot || '{}');
          kakaoName = snap.name || '';
        } catch {}
        return {
          id: m.id, manual_user_id: m.manual_user_id, kakao_user_id: m.kakao_user_id,
          merged_at: m.merged_at, kakao_name: kakaoName,
          manual_real_name: m.manual_real_name || m.manual_name || '',
        };
      });
      return Response.json({ ok: true, merges });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  /* 사장님 명령 (2026-05-07): 옛 합치기 (audit log 없음) best-effort 분리.
   * action=split_legacy { user_id }
   * - 카카오 user (provider='kakao', real_name 있음) 의 데이터를 새 admin user 로 이전
   * - 카카오 user 는 대기 상태로 (real_name=NULL, name_confirmed=0, approval_status='pending')
   * - 새 admin user (real_name 보존) → 모든 매핑·메모·메시지·문서 가져감
   * - OAuth 정보는 카카오 user 에 그대로 (다시 로그인하면 그 카카오 user 로 진입) */
  if (action === "split_legacy") {
    const userId = Number(body.user_id);
    if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
    try {
      const u = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first();
      if (!u) return Response.json({ error: "user not found" }, { status: 404 });
      if (u.provider !== 'kakao') return Response.json({ error: "kakao 가입자가 아님" }, { status: 400 });
      if (!u.real_name) return Response.json({ error: "real_name 없음 — 합치기 흔적이 없습니다" }, { status: 400 });

      const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

      /* legacy provider_id NOT NULL 컬럼 처리 */
      let hasProviderIdCol = false;
      try {
        const info = await db.prepare(`PRAGMA table_info(users)`).all();
        hasProviderIdCol = (info?.results || []).some(c => c.name === 'provider_id');
      } catch {}
      const pseudoExtId = 'admin_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

      /* 1. 새 admin user 생성 (real_name·phone·birth_date 보존) */
      let r;
      if (hasProviderIdCol) {
        r = await db.prepare(
          `INSERT INTO users (provider, provider_id, provider_user_id, name, real_name, phone, birth_date,
                              approval_status, approved_at, approved_by, name_confirmed,
                              created_at, last_login_at)
           VALUES ('admin_created', ?, ?, ?, ?, ?, ?, 'approved_client', ?, 'admin', 1, ?, NULL)`
        ).bind(pseudoExtId, pseudoExtId, u.real_name, u.real_name, u.phone || null, u.birth_date || null, now, now).run();
      } else {
        r = await db.prepare(
          `INSERT INTO users (provider, provider_user_id, name, real_name, phone, birth_date,
                              approval_status, approved_at, approved_by, name_confirmed,
                              created_at, last_login_at)
           VALUES ('admin_created', ?, ?, ?, ?, ?, 'approved_client', ?, 'admin', 1, ?, NULL)`
        ).bind(pseudoExtId, u.real_name, u.real_name, u.phone || null, u.birth_date || null, now, now).run();
      }
      const newAdminUid = r.meta?.last_row_id;
      if (!newAdminUid) return Response.json({ error: "new admin user create failed" }, { status: 500 });

      /* 2. 모든 데이터 → 새 admin user 로 이전 */
      const stats = { mappings: 0, memos: 0, conversations: 0, room_members: 0, documents: 0 };
      try { const r1 = await db.prepare(`UPDATE business_members SET user_id = ? WHERE user_id = ? AND (removed_at IS NULL OR removed_at = '')`).bind(newAdminUid, userId).run(); stats.mappings = r1?.meta?.changes || 0; } catch {}
      try { const r2 = await db.prepare(`UPDATE memos SET target_user_id = ? WHERE target_user_id = ?`).bind(newAdminUid, userId).run(); stats.memos += r2?.meta?.changes || 0; } catch {}
      try { const r3 = await db.prepare(`UPDATE memos SET author_user_id = ? WHERE author_user_id = ?`).bind(newAdminUid, userId).run(); stats.memos += r3?.meta?.changes || 0; } catch {}
      try { const r4 = await db.prepare(`UPDATE conversations SET user_id = ? WHERE user_id = ?`).bind(newAdminUid, userId).run(); stats.conversations = r4?.meta?.changes || 0; } catch {}
      try { const r5 = await db.prepare(`UPDATE room_members SET user_id = ? WHERE user_id = ? AND (left_at IS NULL OR left_at = '')`).bind(newAdminUid, userId).run(); stats.room_members = r5?.meta?.changes || 0; } catch {}
      try { const r6 = await db.prepare(`UPDATE documents SET user_id = ? WHERE user_id = ?`).bind(newAdminUid, userId).run(); stats.documents = r6?.meta?.changes || 0; } catch {}
      try { await db.prepare(`UPDATE business_documents SET user_id = ? WHERE user_id = ?`).bind(newAdminUid, userId).run(); } catch {}

      /* 3. 카카오 user → 대기 상태 (real_name 떼어냄, name 만 유지 = 카카오 닉네임) */
      await db.prepare(`UPDATE users SET real_name = NULL, approval_status = 'pending', name_confirmed = 0, approved_at = NULL WHERE id = ?`).bind(userId).run();

      return Response.json({
        ok: true,
        kakao_user_id: userId,
        new_admin_user_id: newAdminUid,
        new_admin_real_name: u.real_name,
        moved: stats,
        legacy: true,
      });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
