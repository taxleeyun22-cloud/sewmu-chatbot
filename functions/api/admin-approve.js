// 관리자: 사용자 승인/거절/기장승인/거래종료 관리
// - pending/approved_client/approved_guest/rejected : 초기 가입 상태 관리
// - terminated : 기존 거래 관계를 중간에 해지 (상담방도 모두 closed, 접근 차단)
const APPROVAL_STATUSES = ['pending', 'approved_client', 'approved_guest', 'rejected', 'terminated'];

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";

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
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  /* 직원(is_admin=1)도 거래처 조회·승급 가능. 삭제성 액션은 별도 제한 */
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureColumns(db);
  try { await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run(); } catch {}

  const status = url.searchParams.get("status");
  try {
    /* 신규: status=admin 은 is_admin=1 전용 필터 */
    if (status === 'admin') {
      const { results } = await db.prepare(
        `SELECT id, provider, name, real_name, email, phone, profile_image,
                approval_status, approved_at, created_at, last_login_at, name_confirmed, is_admin
         FROM users WHERE is_admin = 1 ORDER BY created_at DESC LIMIT 200`
      ).all();
      const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      for (const u of results) {
        try {
          const usage = await db.prepare(`SELECT count FROM daily_usage WHERE user_id = ? AND date = ?`).bind(u.id, today).first();
          u.today_count = usage ? usage.count : 0;
        } catch { u.today_count = 0; }
      }
      const counts = {};
      for (const s of APPROVAL_STATUSES) {
        const r = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE COALESCE(approval_status, 'pending') = ? AND COALESCE(is_admin, 0) = 0`).bind(s).first();
        counts[s] = r?.c || 0;
      }
      const a = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE is_admin = 1`).first();
      counts.admin = a?.c || 0;
      return Response.json({ users: results, counts });
    }
    /* is_admin=1 은 '👑 관리자' 탭에서만 노출. 기장/일반/대기/거절/종료 에서 숨김.
       관리자 겸 거래처(대표 본인 등)는 관리자 탭에서만 관리.
       거래처 카드에서 '상호 + 이름 + 대표/담당자 구분' 을 한눈에 보려고
       client_businesses 의 주 사업장 company_name·ceo_name 을 같이 반환
       (is_primary DESC, id ASC 우선). real_name === ceo_name 이면 대표, 아니면 담당자 */
    /* 고객이 마이페이지에서 직접 요청한 상호·사업자번호·역할도 같이 내려줌
       → 관리자 승인 모달에서 자동 prefill */
    try { await db.prepare(`ALTER TABLE users ADD COLUMN requested_company_name TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN requested_business_number TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN requested_role TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN requested_at TEXT`).run(); } catch {}
    let query = `
      SELECT u.id, u.provider, u.name, u.real_name, u.email, u.phone, u.profile_image,
             u.approval_status, u.approved_at, u.created_at, u.last_login_at, u.name_confirmed, u.is_admin,
             u.requested_company_name, u.requested_business_number, u.requested_role, u.requested_at,
             (SELECT company_name FROM client_businesses
              WHERE user_id = u.id
              ORDER BY is_primary DESC, id ASC LIMIT 1) AS company_name,
             (SELECT ceo_name FROM client_businesses
              WHERE user_id = u.id
              ORDER BY is_primary DESC, id ASC LIMIT 1) AS ceo_name
      FROM users u
    `;
    const binds = [];
    const where = [`COALESCE(u.is_admin, 0) = 0`];
    if (status && status !== 'all' && APPROVAL_STATUSES.includes(status)) {
      where.push(`COALESCE(u.approval_status, 'pending') = ?`);
      binds.push(status);
    }
    query += ` WHERE ` + where.join(' AND ');
    query += ` ORDER BY u.created_at DESC LIMIT 200`;

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
        `SELECT COUNT(*) as c FROM users WHERE COALESCE(approval_status, 'pending') = ? AND COALESCE(is_admin, 0) = 0`
      ).bind(s).first();
      counts[s] = r?.c || 0;
    }
    try {
      const a = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE is_admin = 1`).first();
      counts.admin = a?.c || 0;
    } catch { counts.admin = 0; }

    return Response.json({ users: results, counts });
  } catch (e) {
    return Response.json({ error: "처리 실패" }, { status: 500 });
  }
}

// POST: 승인 처리
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  /* 직원(is_admin=1)도 거래처 조회·승급 가능. 삭제성 액션은 별도 제한 */
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureColumns(db);

  try {
    const body = await context.request.json();
    const userId = body.user_id;
    const action = body.action;
    const reason = body.reason || null;

    if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });

    /* 📦 폐업 처리 (archive) — 거래 종료보다 가볍게: 상담방만 closed,
       사용자 approval_status·계정·접근 권한은 그대로 유지 */
    if (action === 'archive') {
      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
      try {
        const { results: rooms } = await db.prepare(
          `SELECT rm.room_id FROM room_members rm
           JOIN chat_rooms r ON rm.room_id = r.id
           WHERE rm.user_id = ? AND rm.left_at IS NULL AND r.status = 'active' AND COALESCE(r.is_internal,0)=0`
        ).bind(userId).all();
        let closed = 0;
        for (const rm of (rooms || [])) {
          try {
            await db.prepare(`UPDATE chat_rooms SET status = 'closed' WHERE id = ?`).bind(rm.room_id).run();
            closed++;
          } catch {}
        }
        /* 연결된 업체도 status='closed' 로 (있으면) */
        let bizClosed = 0;
        try {
          const { results: bms } = await db.prepare(
            `SELECT DISTINCT business_id FROM business_members WHERE user_id = ? AND removed_at IS NULL`
          ).bind(userId).all();
          for (const bm of (bms || [])) {
            try { await db.prepare(`UPDATE businesses SET status = 'closed', updated_at = ? WHERE id = ?`).bind(kst, bm.business_id).run(); bizClosed++; } catch {}
          }
        } catch {}
        /* 감사 로그 */
        try {
          await db.prepare(`INSERT INTO audit_log (actor, action, entity_type, entity_id, before, after) VALUES (?, 'archive', 'user', ?, ?, ?)`).bind(
            auth.owner ? 'owner' : ('staff#' + (auth.userId || '?')),
            userId,
            JSON.stringify({ reason }),
            JSON.stringify({ rooms_closed: closed, businesses_closed: bizClosed })
          ).run();
        } catch {}
        return Response.json({ ok: true, archived: true, rooms_closed: closed, businesses_closed: bizClosed, note: '방만 closed. 사용자 계정·접근 권한은 유지됩니다.' });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    let newStatus;
    if (action === 'approve_client') newStatus = 'approved_client';
    else if (action === 'approve_guest') newStatus = 'approved_guest';
    else if (action === 'reject') {
      /* 반려는 owner 전용 (파괴적 액션) */
      if (!auth.owner) return ownerOnly();
      newStatus = 'rejected';
    }
    else if (action === 'terminate') {
      /* 거래 종료 — owner 는 즉시 실행, 직원은 승인 요청 큐에 등록 (파괴적 방지).
         세무사(owner) 가 승인해야 실제 terminated 처리 발동 */
      if (!auth.owner) {
        try {
          await db.prepare(`CREATE TABLE IF NOT EXISTS termination_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            requested_by INTEGER,
            requested_by_name TEXT,
            reason TEXT,
            status TEXT DEFAULT 'pending',
            requested_at TEXT NOT NULL,
            reviewed_by INTEGER,
            reviewed_at TEXT,
            review_note TEXT
          )`).run();
        } catch {}
        /* 동일 대상 pending 중복 방지 */
        const existing = await db.prepare(
          `SELECT id FROM termination_requests WHERE user_id = ? AND status = 'pending'`
        ).bind(userId).first();
        if (existing) {
          return Response.json({ ok: true, queued: true, already_pending: true, request_id: existing.id, message: '이미 대기 중인 요청이 있습니다 (요청 id #' + existing.id + ')' });
        }
        const r = await db.prepare(
          `INSERT INTO termination_requests (user_id, requested_by, requested_by_name, reason, status, requested_at)
           VALUES (?, ?, ?, ?, 'pending', ?)`
        ).bind(userId, auth.userId || null, auth.name || auth.realName || '직원', reason || null, kst).run();
        return Response.json({ ok: true, queued: true, request_id: r.meta?.last_row_id, message: '대표(owner) 승인 대기 큐에 등록됨' });
      }
      newStatus = 'terminated';
    }
    else if (action === 'pending') newStatus = 'pending';
    else return Response.json({ error: "invalid action" }, { status: 400 });

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const actor = auth.owner ? 'owner' : ('staff#' + (auth.userId || '?'));
    /* 이전 상태 확인 (감사·자동 환영 메시지 판단용) */
    const prev = await db.prepare(`SELECT approval_status FROM users WHERE id = ?`).bind(userId).first();
    await db.prepare(
      `UPDATE users SET approval_status = ?, approved_at = ?, approved_by = ?, rejection_reason = ? WHERE id = ?`
    ).bind(newStatus, kst, actor, reason, userId).run();

    /* audit_log 기록 */
    try {
      await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT, action TEXT, entity_type TEXT, entity_id INTEGER,
        before TEXT, after TEXT, created_at TEXT DEFAULT (datetime('now', '+9 hours'))
      )`).run();
      await db.prepare(
        `INSERT INTO audit_log (actor, action, entity_type, entity_id, before, after) VALUES (?, ?, 'user', ?, ?, ?)`
      ).bind(actor, 'approval_change', userId, prev?.approval_status || null, newStatus).run();
    } catch {}

    /* 거래 종료 처리 — 해당 사용자가 속한 모든 활성 방 closed + 해당 사용자 left_at 마킹.
       일반 관리자 멤버는 '종료된 방' 탭에서 계속 볼 수 있고, 거래처 본인은
       my-rooms 조회 시 terminated 상태에 의해 접근 차단됨 (아래 my-rooms 쿼리 수정 참고) */
    if (newStatus === 'terminated' && prev?.approval_status !== 'terminated') {
      try {
        const { results: rooms } = await db.prepare(
          `SELECT rm.room_id FROM room_members rm
           JOIN chat_rooms r ON rm.room_id = r.id
           WHERE rm.user_id = ? AND rm.left_at IS NULL AND r.status = 'active'`
        ).bind(userId).all();
        for (const rm of (rooms || [])) {
          try {
            await db.prepare(`UPDATE chat_rooms SET status = 'closed' WHERE id = ?`).bind(rm.room_id).run();
            await db.prepare(`UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?`).bind(kst, rm.room_id, userId).run();
          } catch {}
        }
      } catch {}
    }

    /* 신규 approved_client 로 승급 시 자동 환영 메시지 (상담방 멤버인 경우만) */
    if (newStatus === 'approved_client' && prev?.approval_status !== 'approved_client') {
      try {
        const rooms = await db.prepare(
          `SELECT room_id FROM room_members WHERE user_id = ? AND left_at IS NULL LIMIT 5`
        ).bind(userId).all();
        const userInfo = await db.prepare(`SELECT real_name, name FROM users WHERE id = ?`).bind(userId).first();
        const nm = userInfo?.real_name || userInfo?.name || '대표님';
        const welcome = `🎉 ${nm} 대표님, 세무회계 이윤 기장거래처로 승급되셨습니다!\n\n이제 다음 기능을 이용하실 수 있습니다:\n• 영수증 사진 자동 분류 (AI)\n• 24시간 세무 질문 무제한\n\n먼저 마이페이지에서 필수 서류(신분증·사업자등록증·홈택스 ID)를 등록해주세요.\n담당자가 곧 연락드리겠습니다.`;
        for (const rm of (rooms.results || [])) {
          await db.prepare(
            `INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
             VALUES (?, NULL, 'human_advisor', ?, ?, ?)`
          ).bind('room_' + rm.room_id, welcome, rm.room_id, kst).run();
        }
      } catch {}
    }

    return Response.json({ ok: true, status: newStatus });
  } catch (e) {
    return Response.json({ error: "처리 실패" }, { status: 500 });
  }
}
