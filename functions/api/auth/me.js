// 현재 로그인 사용자 정보 반환
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ logged_in: false });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ logged_in: false });

  const token = match[1];

  try {
    const session = await db.prepare(`
      SELECT s.user_id, s.expires_at, u.name, u.real_name, u.email, u.phone, u.provider, u.profile_image,
             u.approval_status, u.name_confirmed
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
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

    // 승인상태별 일일 한도
    const status = session.approval_status || 'pending';
    const dailyLimit = status === 'approved_client' ? 30
                     : status === 'approved_guest' ? 10
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
        daily_limit: dailyLimit,
        daily_used: todayCount,
        daily_remaining: Math.max(0, dailyLimit - todayCount),
      },
    });
  } catch {
    return Response.json({ logged_in: false });
  }
}
