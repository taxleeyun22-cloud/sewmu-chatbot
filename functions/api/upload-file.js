// 일반 파일 업로드 (PDF·엑셀·한글·워드 등). 이미지는 upload-image.js 사용.
// 바인딩 필요: MEDIA_BUCKET
// 인증: (1) 세션 쿠키 또는 (2) ?key=ADMIN_KEY

import { rateLimit, getClientIP } from "./_ratelimit.js";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
/* Phase R6 (2026-05-05 사장님 명령: "걍 다 올릴수있게"): 화이트리스트 대폭 확장 */
const ALLOWED_TYPES = [
  /* 문서 */
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.hancom.hwp',
  'application/x-hwpml',
  'application/haansofthwpx',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  /* 이미지 — 영수증·사진 핵심 */
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/bmp', 'image/svg+xml', 'image/tiff',
  /* 영상 — 화면 녹화 등 */
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska',
  /* 음성 */
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-m4a', 'audio/mp4',
  'audio/ogg', 'audio/webm',
  /* 압축 */
  'application/zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/vnd.rar',
  'application/x-7z-compressed',
  /* 기타 자주 쓰이는 */
  'application/json', 'application/xml', 'text/xml',
  'application/octet-stream',  // 브라우저가 타입 모르는 경우 fallback (확장자로 판단)
];

const EXT_WHITELIST = [
  /* 문서 */
  'pdf','xls','xlsx','doc','docx','ppt','pptx','hwp','hwpx',
  'rtf','odt','ods','odp',
  'txt','csv','md',
  /* 이미지 */
  'jpg','jpeg','png','gif','webp','heic','heif','bmp','svg','tif','tiff',
  /* 영상 */
  'mp4','mov','avi','webm','mkv',
  /* 음성 */
  'mp3','wav','m4a','ogg','aac','flac',
  /* 압축 */
  'zip','rar','7z',
  /* 기타 */
  'json','xml',
];

export async function onRequestPost(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return Response.json({ error: "R2 저장소 미설정" }, { status: 500 });

  /* Rate limit: IP 1분 20회 */
  const ip = getClientIP(context.request);
  const rl = await rateLimit(db, `upload_file:${ip}`, 20, 60);
  if (!rl.ok) return Response.json({ error: '너무 많은 요청' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });

  const url = new URL(context.request.url);
  const adminKey = context.env.ADMIN_KEY;
  const isAdmin = adminKey && url.searchParams.get("key") === adminKey;

  let userId = null;
  if (!isAdmin) {
    const cookie = context.request.headers.get("Cookie") || "";
    const match = cookie.match(/session=([^;]+)/);
    if (!match) return Response.json({ error: "로그인 필요" }, { status: 401 });
    if (db) {
      try {
        const s = await db.prepare(
          `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
        ).bind(match[1]).first();
        if (s) userId = s.user_id;
      } catch {}
    }
    if (!userId) return Response.json({ error: "세션 만료" }, { status: 401 });
  }

  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') return Response.json({ error: "파일이 없습니다" }, { status: 400 });

    const size = file.size;
    if (size <= 0) return Response.json({ error: "빈 파일" }, { status: 400 });
    if (size > MAX_SIZE) return Response.json({ error: "20MB 이하만 업로드 가능합니다" }, { status: 400 });

    const rawName = file.name || 'file';
    /* 보안: 원본 파일명 sanitize (제어문자·경로 구분자 제거, 길이 제한) */
    const origName = rawName.replace(/[\x00-\x1f\\\/]/g, '_').slice(0, 200) || 'file';
    const dotIdx = origName.lastIndexOf('.');
    const rawExt = dotIdx >= 0 ? origName.slice(dotIdx + 1).toLowerCase() : '';
    /* 확장자 화이트리스트 엄격 적용 (MIME과 확장자 둘 다 허용 목록 매칭 필수) */
    const ext = EXT_WHITELIST.includes(rawExt) ? rawExt : '';
    const type = file.type || 'application/octet-stream';
    const mimeOk = ALLOWED_TYPES.includes(type);
    if (!ext || (!mimeOk && type !== 'application/octet-stream')) {
      return Response.json({ error: "이 파일 형식은 지원 안 됨 (지원: PDF·엑셀·워드·한글·PPT·이미지·영상·음성·압축 등 — 자세한 건 사장님께 문의)" }, { status: 400 });
    }

    const prefix = isAdmin ? 'admin/files' : `u${userId}/files`;
    const key = `${prefix}/${Date.now()}_${crypto.randomUUID().replace(/-/g,'').slice(0,12)}.${ext}`;

    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: type },
      customMetadata: {
        user_id: isAdmin ? 'admin' : String(userId),
        original_name: origName,
        uploaded_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
      }
    });

    return Response.json({
      ok: true,
      key,
      url: `/api/file?k=${encodeURIComponent(key)}&name=${encodeURIComponent(origName)}`,
      name: origName,
      size,
      type,
      ext,
    });
  } catch (e) {
    /* 보안: 내부 에러 메시지 미노출 */
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
