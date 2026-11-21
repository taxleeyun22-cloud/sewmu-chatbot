// R2 이미지 서빙: /api/image?k=u123/16800_abc.jpg
// 보안 메모:
// - R2 키는 CSPRNG 기반 랜덤이라 URL 추측 사실상 불가 (업로드 라우트에서 crypto.randomUUID 사용)
// - 키 포맷 regex로 path traversal·기형 키 차단
// - nosniff + no-referrer 적용
// - 열람 권한은 _media-auth.js (관리자 전부 / 거래처 본인 것 + 내 상담방 것 / memos·guides 관리자만)

import { canViewMedia } from "./_media-auth.js";

const KEY_RE = /^[A-Za-z0-9_.\-\/]{1,256}$/;

const SAFE_INLINE_IMAGE = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/bmp', 'image/tiff']);

export async function onRequestGet(context) {
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return new Response("R2 not configured", { status: 500 });

  const url = new URL(context.request.url);
  const key = url.searchParams.get("k") || "";
  if (!key || !KEY_RE.test(key) || key.includes("..")) {
    return new Response("bad key", { status: 400 });
  }

  /* 열람 권한 — 관리자 전부 / 거래처는 본인 것 + 내 상담방에 올라온 것 (보안 점검 PR-2, 2026-11-21) */
  const perm = await canViewMedia(context, key);
  if (!perm.ok) return new Response(perm.status === 401 ? "Unauthorized" : "Forbidden", { status: perm.status });

  try {
    const obj = await bucket.get(key);
    if (!obj) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('etag', obj.httpEtag);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    /* 보안 (2026-11-19 점검 H2): 화면에 바로 띄우는 건 일반 사진 형식만.
       svg·html·xml 등 스크립트를 품을 수 있는 형식은 다운로드로만, 그리고 어떤 경우든 스크립트 실행 금지 */
    headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    let ct = String(headers.get('Content-Type') || '').toLowerCase().split(';')[0].trim();
    /* 브라우저가 형식을 몰라 octet-stream 으로 올린 사진(HEIC 등)은 확장자로 다시 판단 */
    if (!ct || ct === 'application/octet-stream') {
      const ext = (key.split('.').pop() || '').toLowerCase();
      const byExt = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
        heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff' }[ext];
      if (byExt) { ct = byExt; headers.set('Content-Type', byExt); }
    }
    if (!SAFE_INLINE_IMAGE.has(ct)) {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', 'attachment');
    }

    return new Response(obj.body, { headers });
  } catch (e) {
    return new Response("Error", { status: 500 });
  }
}
