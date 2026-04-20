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
    if (size <= 0) return Response.json({ error: "빈 파일" }, { status: 400 });
    if (size > MAX_SIZE) return Response.json({ error: "10MB 이하만 업로드 가능합니다" }, { status: 400 });

    const type = file.type || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(type)) {
      return Response.json({ error: "이미지 파일만 업로드 가능합니다 (JPEG/PNG/WEBP/GIF/HEIC)" }, { status: 400 });
    }

    /* 보안:
       - 키는 CSPRNG 기반 UUID 사용 (Math.random 금지)
       - 확장자는 MIME에서 파생, 화이트리스트만 허용 (파일명 경로 주입 방지)
       - original_name은 제어문자 제거하고 길이 제한 */
    const extMap = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/heic':'heic' };
    const ext = extMap[type] || 'bin';
    const prefix = isAdmin ? 'admin' : `u${userId}`;
    const key = `${prefix}/${Date.now()}_${crypto.randomUUID().replace(/-/g,'').slice(0,12)}.${ext}`;

    const safeName = (file.name || '').replace(/[\x00-\x1f\\\/]/g,'_').slice(0, 200);

    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: type },
      customMetadata: {
        user_id: isAdmin ? 'admin' : String(userId),
        original_name: safeName,
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
    /* 보안: 내부 에러 메시지 미노출 */
    return Response.json({ error: "업로드 실패" }, { status: 500 });
  }
}
