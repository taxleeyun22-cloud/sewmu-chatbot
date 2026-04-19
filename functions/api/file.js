// R2 파일 서빙 + 다운로드 헤더 (원본 파일명 유지)
// /api/file?k=<key>&name=<originalFilename>
export async function onRequestGet(context) {
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return new Response("R2 not configured", { status: 500 });

  const url = new URL(context.request.url);
  const key = url.searchParams.get("k");
  const name = url.searchParams.get("name") || "file";
  if (!key) return new Response("missing key", { status: 400 });

  try {
    const obj = await bucket.get(key);
    if (!obj) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('etag', obj.httpEtag);
    // RFC 5987 encoded filename 으로 한글·공백 보존
    const encoded = encodeURIComponent(name).replace(/['()]/g, escape);
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);

    return new Response(obj.body, { headers });
  } catch (e) {
    return new Response("Error: " + e.message, { status: 500 });
  }
}
