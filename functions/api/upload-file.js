// 일반 파일 업로드 (PDF·엑셀·한글·워드 등). 이미지는 upload-image.js 사용.
// 바인딩 필요: MEDIA_BUCKET
// 인증: (1) 세션 쿠키 또는 (2) ?key=ADMIN_KEY

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
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
  'text/plain',
  'text/csv',
  'application/zip',
  'application/octet-stream',  // HWP 등 브라우저가 타입 모르는 경우 fallback
];

const EXT_WHITELIST = ['pdf','xls','xlsx','doc','docx','ppt','pptx','hwp','hwpx','txt','csv','zip'];

export async function onRequestPost(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return Response.json({ error: "R2 저장소 미설정" }, { status: 500 });

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
    if (size > MAX_SIZE) return Response.json({ error: "20MB 이하만 업로드 가능합니다" }, { status: 400 });

    const origName = file.name || 'file';
    const dotIdx = origName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? origName.slice(dotIdx + 1).toLowerCase() : '';
    const type = file.type || 'application/octet-stream';

    // 확장자 or MIME 둘 중 하나라도 허용 목록이면 통과
    const extOk = ext && EXT_WHITELIST.includes(ext);
    const mimeOk = ALLOWED_TYPES.includes(type);
    if (!extOk && !mimeOk) {
      return Response.json({ error: "허용되지 않은 파일 형식입니다 (PDF/엑셀/워드/한글/PPT/TXT/CSV/ZIP)" }, { status: 400 });
    }

    const random = Math.random().toString(36).slice(2, 10);
    const prefix = isAdmin ? 'admin/files' : `u${userId}/files`;
    const safeExt = ext || 'bin';
    const key = `${prefix}/${Date.now()}_${random}.${safeExt}`;

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
    return Response.json({ error: e.message }, { status: 500 });
  }
}
