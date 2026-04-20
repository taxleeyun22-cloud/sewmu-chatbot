// R2 이미지 서빙: /api/image?k=u123/16800_abc.jpg
// 보안:
// - 익명 접근 차단. 세션 쿠키(로그인) 또는 ADMIN_KEY 중 하나 필요.
// - 키는 허용 문자 집합만 허용 (path traversal·기형 키 차단)
// - 외부 임베드 시 Referrer-Policy/X-Content-Type-Options 적용

const KEY_RE = /^[A-Za-z0-9_.\-\/]{1,256}$/;

async function hasSession(db, request) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/session=([^;]+)/);
  if (!m) return false;
  try {
    const row = await db.prepare(
      `SELECT 1 FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(m[1]).first();
    return !!row;
  } catch { return false; }
}

export async function onRequestGet(context) {
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return new Response("R2 not configured", { status: 500 });

  const url = new URL(context.request.url);
  const key = url.searchParams.get("k") || "";
  if (!key || !KEY_RE.test(key) || key.includes("..")) {
    return new Response("bad key", { status: 400 });
  }

  /* 인증: 세션 로그인 상태이거나 ADMIN_KEY 보유 */
  const adminKey = context.env.ADMIN_KEY;
  const providedKey = url.searchParams.get("key");
  const isAdmin = adminKey && providedKey === adminKey;
  if (!isAdmin) {
    const db = context.env.DB;
    if (!db || !(await hasSession(db, context.request))) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const obj = await bucket.get(key);
    if (!obj) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('etag', obj.httpEtag);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');

    return new Response(obj.body, { headers });
  } catch (e) {
    /* 보안: 스택·경로 미노출 */
    return new Response("Error", { status: 500 });
  }
}
