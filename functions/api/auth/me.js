// 현재 로그인 사용자 정보 반환
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ logged_in: false });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ logged_in: false });

  const token = match[1];

  try {
    // 컬럼 보장
    try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_overseas INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_overseas_at TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_age_14 INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_tos INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_privacy INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_marketing INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN consent_all_at TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN deleted_at TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN withdrawal_reason TEXT`).run(); } catch {}

    const session = await db.prepare(`
      SELECT s.user_id, s.expires_at, u.name, u.real_name, u.email, u.phone, u.provider, u.profile_image,
             u.approval_status, u.name_confirmed, u.is_admin,
             u.consent_age_14, u.consent_tos, u.consent_privacy, u.consent_overseas,
             u.consent_marketing, u.consent_all_at, u.consent_overseas_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now') AND u.deleted_at IS NULL
    `).bind(token).first();

    if (!session) return Response.json({ logged_in: false });

    // 오늘 사용량 조회 (KST 기준)
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let todayCount = 0;
    try {
      const usage = await db.prepare(
        `SELECT count FROM daily_usage WHERE user_id = ? AND date = ?`
      ).bind(session.user_id, today).first();
      todayCount = usage ? usage.count : 0;
    } catch {}

    // 승인상태별 일일 한도 (is_admin=1 관리자/스태프는 무제한)
    const status = session.approval_status || 'pending';
    const isAdmin = !!session.is_admin;
    const dailyLimit = isAdmin ? 999999
                     : status === 'approved_client' ? 999999
                     : status === 'approved_guest' ? 5
                     : status === 'rejected' ? 0
                     : 3;

    return Response.json({
      logged_in: true,
      user: {
        id: session.user_id,
        name: session.name,
        real_name: session.real_name,
        email: session.email,
        phone: session.phone,
        provider: session.provider,
        profile_image: session.profile_image,
        approval_status: status,
        name_confirmed: session.name_confirmed ? true : false,
        is_admin: session.is_admin ? true : false,
        consent_age_14: session.consent_age_14 ? true : false,
        consent_tos: session.consent_tos ? true : false,
        consent_privacy: session.consent_privacy ? true : false,
        consent_overseas: session.consent_overseas ? true : false,
        consent_marketing: session.consent_marketing ? true : false,
        consent_all_at: session.consent_all_at || null,
        consent_overseas_at: session.consent_overseas_at || null,
        consent_required_ok: (session.consent_age_14 && session.consent_tos && session.consent_privacy && session.consent_overseas) ? true : false,
        daily_limit: dailyLimit,
        daily_used: todayCount,
        daily_remaining: Math.max(0, dailyLimit - todayCount),
      },
    });
  } catch {
    return Response.json({ logged_in: false });
  }
}
