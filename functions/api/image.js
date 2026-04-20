// R2 이미지 서빙: /api/image?k=u123/16800_abc.jpg
// 보안 메모:
// - R2 키는 CSPRNG 기반 랜덤이라 URL 추측 사실상 불가 (업로드 라우트에서 crypto.randomUUID 사용)
// - 키 포맷 regex로 path traversal·기형 키 차단
// - nosniff + no-referrer 적용

const KEY_RE = /^[A-Za-z0-9_.\-\/]{1,256}$/;

export async function onRequestGet(context) {
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return new Response("R2 not configured", { status: 500 });

  const url = new URL(context.request.url);
  const key = url.searchParams.get("k") || "";
  if (!key || !KEY_RE.test(key) || key.includes("..")) {
    return new Response("bad key", { status: 400 });
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
    return new Response("Error", { status: 500 });
  }
}
