// 메모 첨부 파일 업로드 — R2 저장 후 key/name/size/mime 반환
// 인증: checkAdmin (ADMIN_KEY 또는 직원 admin 세션). 메모는 관리자 영역.
// 화이트리스트: 이미지(JPEG/PNG/WEBP/HEIC) + 문서(PDF/HWP/HWPX)
// 키: memos/{adminId}/{timestamp}_{uuid12}.{ext}
//
// 응답: { ok, key, name, size, mime, url }
// 클라이언트는 받은 key/name/size/mime 를 메모 POST 의 attachments 배열에 넣어 보냄.

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";
import { rateLimit, getClientIP } from "./_ratelimit.js";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/* MIME 화이트리스트 + 확장자 매핑 */
const ALLOWED_MIMES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/x-hwp': 'hwp',
  'application/vnd.hancom.hwp': 'hwp',
  'application/x-hwpx': 'hwpx',
  'application/vnd.hancom.hwpx': 'hwpx',
  'application/haansofthwp': 'hwp',
};

/* 일부 브라우저가 .hwp 를 application/octet-stream 으로 보냄 — 파일명 확장자 fallback */
const FALLBACK_EXT = ['hwp', 'hwpx', 'pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

export async function onRequestPost(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;

  if (!bucket) {
    return Response.json({ error: "R2 저장소 미설정 (MEDIA_BUCKET binding 필요)" }, { status: 500 });
  }

  /* 관리자 인증 (ADMIN_KEY 또는 cookie 세션 + is_admin=1) */
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();

  /* Rate limit */
  const ip = getClientIP(context.request);
  const rl = await rateLimit(db, `upload_memo:${ip}`, 60, 60);
  if (!rl.ok) return Response.json({ error: '너무 많은 요청' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });

  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') return Response.json({ error: "파일이 없습니다" }, { status: 400 });

    const size = file.size;
    if (size <= 0) return Response.json({ error: "빈 파일" }, { status: 400 });
    if (size > MAX_SIZE) return Response.json({ error: "10MB 이하만 업로드 가능합니다" }, { status: 413 });

    const mimeRaw = (file.type || '').toLowerCase();
    const safeName = (file.name || '').replace(/[\x00-\x1f\\\/]/g, '_').slice(0, 200);

    /* MIME 결정: 화이트리스트 우선, 안 되면 파일명 확장자 fallback (octet-stream 대응) */
    let ext = ALLOWED_MIMES[mimeRaw];
    let mime = mimeRaw;
    if (!ext) {
      const m = safeName.toLowerCase().match(/\.([a-z0-9]+)$/);
      const fileExt = m ? m[1] : '';
      if (FALLBACK_EXT.includes(fileExt)) {
        ext = fileExt;
        /* 매핑된 mime — 저장 시 정확한 mime 으로 */
        const reverseMap = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
          gif: 'image/gif', pdf: 'application/pdf',
          hwp: 'application/x-hwp', hwpx: 'application/x-hwpx',
        };
        mime = reverseMap[fileExt] || 'application/octet-stream';
      } else {
        return Response.json({
          error: "허용되지 않은 형식 (이미지: JPG/PNG/WEBP/HEIC/GIF, 문서: PDF/HWP/HWPX 만)"
        }, { status: 400 });
      }
    }

    /* CSPRNG key 생성 */
    const adminId = auth.userId || 'admin';
    const key = `memos/${adminId}/${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}.${ext}`;

    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: mime },
      customMetadata: {
        admin_id: String(adminId),
        original_name: safeName,
        uploaded_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
        purpose: 'memo_attachment',
      }
    });

    return Response.json({
      ok: true,
      key,
      name: safeName,
      size,
      mime,
      url: `/api/file?k=${encodeURIComponent(key)}`,
    });
  } catch (e) {
    /* 보안: 내부 에러 메시지 미노출 */
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
