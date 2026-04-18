// 이미지 업로드: Cloudflare R2에 저장 후 키 반환
// 바인딩 필요: MEDIA_BUCKET (Cloudflare Pages > Settings > Functions > R2 bindings)
// 기본적으로 로그인 사용자만 업로드 가능

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];

export async function onRequestPost(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;

  if (!bucket) {
    return Response.json({ error: "R2 저장소가 설정되지 않았습니다. (사장님: Cloudflare Pages 설정에서 MEDIA_BUCKET R2 바인딩 필요)" }, { status: 500 });
  }

  // 인증: (1) 사용자 세션 쿠키, 또는 (2) ?key=ADMIN_KEY (관리자)
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
    if (size > MAX_SIZE) return Response.json({ error: "10MB 이하만 업로드 가능합니다" }, { status: 400 });

    const type = file.type || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(type)) {
      return Response.json({ error: "이미지 파일만 업로드 가능합니다 (JPEG/PNG/WEBP/GIF/HEIC)" }, { status: 400 });
    }

    // 키 생성: user_id/timestamp_random.ext (관리자는 admin/ 프리픽스)
    const ext = type.split('/')[1] || 'bin';
    const random = Math.random().toString(36).slice(2, 10);
    const prefix = isAdmin ? 'admin' : `u${userId}`;
    const key = `${prefix}/${Date.now()}_${random}.${ext}`;

    await bucket.put(key, file.stream(), {
      httpMetadata: {
        contentType: type,
      },
      customMetadata: {
        user_id: isAdmin ? 'admin' : String(userId),
        original_name: file.name || '',
        uploaded_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
      }
    });

    return Response.json({
      ok: true,
      key,
      url: `/api/image?k=${encodeURIComponent(key)}`,
      size,
      type,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
