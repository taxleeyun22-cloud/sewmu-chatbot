// 로그아웃 - 세션 삭제
async function deleteSession(context) {
  const db = context.env.DB;
  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (match && db) {
    try {
      await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(match[1]).run();
    } catch {}
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  await deleteSession(context);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.origin + "/",
      "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}

/* Phase 16 (2026-05-13): admin.js logout() 가 POST 로 호출 — sessions row 삭제 + cookie clear */
export async function onRequestPost(context) {
  await deleteSession(context);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}
