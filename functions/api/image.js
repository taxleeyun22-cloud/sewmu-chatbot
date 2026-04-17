// R2 이미지 서빙: /api/image?k=u123/16800_abc.jpg
export async function onRequestGet(context) {
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return new Response("R2 not configured", { status: 500 });

  const url = new URL(context.request.url);
  const key = url.searchParams.get("k");
  if (!key) return new Response("missing key", { status: 400 });

  try {
    const obj = await bucket.get(key);
    if (!obj) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('etag', obj.httpEtag);

    return new Response(obj.body, { headers });
  } catch (e) {
    return new Response("Error: " + e.message, { status: 500 });
  }
}
