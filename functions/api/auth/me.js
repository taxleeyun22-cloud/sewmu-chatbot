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
      SELECT s.user_id, s.expires_at, u.name, u.email, u.phone, u.provider, u.profile_image
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).bind(token).first();

    if (!session) return Response.json({ logged_in: false });

    return Response.json({
      logged_in: true,
      user: {
        id: session.user_id,
        name: session.name,
        email: session.email,
        phone: session.phone,
        provider: session.provider,
        profile_image: session.profile_image,
      },
    });
  } catch {
    return Response.json({ logged_in: false });
  }
}
