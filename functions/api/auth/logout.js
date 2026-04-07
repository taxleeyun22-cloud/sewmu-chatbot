// 로그아웃 - 세션 삭제
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const db = context.env.DB;

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);

  if (match && db) {
    try {
      await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(match[1]).run();
    } catch {}
  }

  // 카카오 로그아웃 URL로 리다이렉트 (카카오 세션도 끊기)
  const kakaoLogoutUrl = `https://kauth.kakao.com/oauth/logout?client_id=${context.env.KAKAO_CLIENT_ID}&logout_redirect_uri=${encodeURIComponent(url.origin + '/')}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: kakaoLogoutUrl,
      "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}
