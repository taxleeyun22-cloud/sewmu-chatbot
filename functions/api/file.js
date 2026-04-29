// R2 파일 서빙 + 다운로드 헤더 (원본 파일명 유지)
// /api/file?k=<key>&name=<originalFilename>
// 보안 메모:
// - R2 키는 CSPRNG 랜덤 (업로드 라우트) → 추측 불가
// - 키 regex로 path traversal 차단
// - 파일명은 제어문자·경로 구분자 제거 후 Content-Disposition 세팅
// - memos/ prefix (메모 첨부) 는 관리자 인증 필수 — 거래처 민감 자료 보호

import { checkAdmin } from "./_adminAuth.js";

const KEY_RE = /^[A-Za-z0-9_.\-\/]{1,256}$/;

function sanitizeDownloadName(raw) {
  if (!raw) return 'file';
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

  /* 메모 첨부는 관리자만 접근 가능 (사업자등록증·영수증 등 민감 자료) */
  if (key.startsWith('memos/')) {
    const auth = await checkAdmin(context);
    if (!auth) return new Response("Unauthorized", { status: 401 });
  }

  const name = sanitizeDownloadName(nameRaw);

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
