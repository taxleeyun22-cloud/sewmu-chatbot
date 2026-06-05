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
  /* 2026-06-05: admin_key_auth(사장님 비번 30일 유지 쿠키)도 함께 삭제 → 정상 아웃 */
  const headers = new Headers({ Location: url.origin + "/" });
  headers.append("Set-Cookie", "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  headers.append("Set-Cookie", "admin_key_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(null, { status: 302, headers });
}

/* Phase 16 (2026-05-13): admin.js logout() 가 POST 로 호출 — sessions row 삭제 + cookie clear */
export async function onRequestPost(context) {
  await deleteSession(context);
  /* 2026-06-05: admin_key_auth(사장님 비번 30일 유지 쿠키)도 함께 삭제 → 정상 아웃 */
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  headers.append("Set-Cookie", "admin_key_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
