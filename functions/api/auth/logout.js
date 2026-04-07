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

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.origin + "/",
      "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}
