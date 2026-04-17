// 관리자 실시간 대화 개입:
// - GET  /api/admin-live (list): 최근 30분 활성 세션 목록
// - GET  /api/admin-live?session=XXX (detail): 특정 세션 메시지 + 상태
// - POST /api/admin-live (send): 세무사 메시지 전송 { session_id, user_id, content }
// - POST /api/admin-live?action=toggle_ai: { session_id, user_id, ai_mode: 'on'|'off' }

function checkAuth(url, env) {
  const key = url.searchParams.get("key");
  return env.ADMIN_KEY && key === env.ADMIN_KEY;
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS live_sessions (
    session_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    ai_mode TEXT DEFAULT 'on',
    advisor_unread INTEGER DEFAULT 0,
    user_unread INTEGER DEFAULT 0,
    last_user_msg_at TEXT,
    last_advisor_msg_at TEXT,
    updated_at TEXT,
    PRIMARY KEY (session_id, user_id)
  )`).run();
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

// GET: 세션 목록 or 세션 상세
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (!checkAuth(url, context.env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTables(db);

  const sessionId = url.searchParams.get("session");
  const userId = url.searchParams.get("user_id");

  try {
    if (sessionId && userId) {
      // 상세: 메시지 + 모드 정보
      const live = await db.prepare(
        `SELECT ai_mode, advisor_unread, last_user_msg_at, last_advisor_msg_at
         FROM live_sessions WHERE session_id = ? AND user_id = ?`
      ).bind(sessionId, userId).first();

      const { results: messages } = await db.prepare(`
        SELECT id, role, content, created_at
        FROM conversations
        WHERE session_id = ? AND user_id = ?
        ORDER BY created_at ASC
        LIMIT 200
      `).bind(sessionId, userId).all();

      // 조회 시점에 unread 카운트 리셋
      await db.prepare(
        `UPDATE live_sessions SET advisor_unread = 0, updated_at = ? WHERE session_id = ? AND user_id = ?`
      ).bind(kst(), sessionId, userId).run();

      return Response.json({
        ai_mode: live?.ai_mode || 'on',
        messages: messages || [],
      });
    }

    // 목록: 최근 30분 내 메시지 있는 세션
    const { results } = await db.prepare(`
      SELECT
        c.session_id,
        c.user_id,
        u.name as user_name,
        u.real_name as real_name,
        u.profile_image as profile_image,
        u.approval_status as approval_status,
        MAX(c.created_at) as last_at,
        COUNT(*) as msg_count,
        COALESCE(ls.ai_mode, 'on') as ai_mode,
        COALESCE(ls.advisor_unread, 0) as advisor_unread
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN live_sessions ls ON ls.session_id = c.session_id AND ls.user_id = c.user_id
      WHERE c.user_id IS NOT NULL
        AND datetime(c.created_at) > datetime('now', '+9 hours', '-30 minutes')
      GROUP BY c.session_id, c.user_id
      ORDER BY last_at DESC
      LIMIT 50
    `).all();

    // 마지막 user 메시지 미리보기 추가
    for (const s of results || []) {
      const lastUser = await db.prepare(
        `SELECT content FROM conversations
         WHERE session_id = ? AND user_id = ? AND role = 'user'
         ORDER BY created_at DESC LIMIT 1`
      ).bind(s.session_id, s.user_id).first();
      s.last_user_message = lastUser ? lastUser.content.slice(0, 80) : '';
    }

    // 전체 unread 카운트
    const unreadRow = await db.prepare(
      `SELECT SUM(advisor_unread) as total FROM live_sessions WHERE advisor_unread > 0`
    ).first();

    return Response.json({
      sessions: results || [],
      total_unread: unreadRow?.total || 0,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST: 세무사 메시지 전송 or AI 모드 토글
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (!checkAuth(url, context.env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  await ensureTables(db);

  const action = url.searchParams.get("action") || "send";

  try {
    const body = await context.request.json();
    const sessionId = body.session_id;
    const userId = body.user_id;

    if (!sessionId || !userId) {
      return Response.json({ error: "session_id and user_id required" }, { status: 400 });
    }

    const now = kst();

    if (action === "toggle_ai") {
      const aiMode = body.ai_mode === 'off' ? 'off' : 'on';
      await db.prepare(`
        INSERT INTO live_sessions (session_id, user_id, ai_mode, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id, user_id) DO UPDATE SET ai_mode = ?, updated_at = ?
      `).bind(sessionId, userId, aiMode, now, aiMode, now).run();
      return Response.json({ ok: true, ai_mode: aiMode });
    }

    // 메시지 전송
    const content = (body.content || "").trim();
    if (!content) return Response.json({ error: "content required" }, { status: 400 });
    if (content.length > 5000) return Response.json({ error: "메시지가 너무 깁니다" }, { status: 400 });

    // conversations에 human_advisor 역할로 저장
    await db.prepare(
      `INSERT INTO conversations (session_id, user_id, role, content, created_at)
       VALUES (?, ?, 'human_advisor', ?, ?)`
    ).bind(sessionId, userId, content, now).run();

    // live_sessions upsert: user_unread++, last_advisor_msg_at
    await db.prepare(`
      INSERT INTO live_sessions (session_id, user_id, ai_mode, user_unread, last_advisor_msg_at, updated_at)
      VALUES (?, ?, COALESCE((SELECT ai_mode FROM live_sessions WHERE session_id = ? AND user_id = ?), 'on'), 1, ?, ?)
      ON CONFLICT(session_id, user_id) DO UPDATE SET
        user_unread = user_unread + 1,
        last_advisor_msg_at = ?,
        updated_at = ?
    `).bind(sessionId, userId, sessionId, userId, now, now, now, now).run();

    return Response.json({ ok: true, sent_at: now });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
