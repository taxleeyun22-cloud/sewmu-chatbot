// R2 파일 서빙 + 다운로드 헤더 (원본 파일명 유지)
// /api/file?k=<key>&name=<originalFilename>
// 보안: 세션/ADMIN 인증 강제. 키 포맷 검증. 파일명 제어문자·경로 문자 제거.

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

function sanitizeDownloadName(raw) {
  if (!raw) return 'file';
  // 제어문자·경로 구분자·"<>|& 제거. 길이 제한.
  return String(raw).replace(/[\x00-\x1f\\\/<>|:"?*&]/g, '_').slice(0, 200) || 'file';
}

export async function onRequestGet(context) {
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return new Response("R2 not configured", { status: 500 });

  const url = new URL(context.request.url);
  const key = url.searchParams.get("k") || "";
  const nameRaw = url.searchParams.get("name") || "file";
  if (!key || !KEY_RE.test(key) || key.includes("..")) {
    return new Response("bad key", { status: 400 });
  }
  const name = sanitizeDownloadName(nameRaw);

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
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('etag', obj.httpEtag);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    const encoded = encodeURIComponent(name).replace(/['()]/g, escape);
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);

    return new Response(obj.body, { headers });
  } catch (e) {
    return new Response("Error", { status: 500 });
  }
}
