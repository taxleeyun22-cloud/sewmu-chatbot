// 카카오 OAuth 콜백 핸들러
async function initTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      profile_image TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT DEFAULT (datetime('now')),
      UNIQUE(provider, provider_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`)
  ]);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return Response.redirect(url.origin + "/?login_error=cancelled", 302);
  }

  const clientId = context.env.KAKAO_CLIENT_ID;
  const clientSecret = context.env.KAKAO_CLIENT_SECRET;
  const redirectUri = url.origin + "/api/auth/kakao";

  try {
    // 1. 인가 코드로 토큰 발급
    const tokenParams = {
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code: code,
    };

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return new Response("토큰 발급 실패: " + JSON.stringify(tokenData) + " | client_id: " + clientId + " | redirect_uri: " + redirectUri, { status: 400 });
    }

    // 2. 사용자 정보 조회
    const userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const userData = await userRes.json();

    const kakaoId = String(userData.id);
    const kakaoAccount = userData.kakao_account || {};
    const profile = kakaoAccount.profile || {};
    const name = profile.nickname || "";
    const email = kakaoAccount.email || "";
    const phone = (kakaoAccount.phone_number || "").replace("+82 ", "0");
    const profileImage = profile.profile_image_url || "";

    // 3. DB에 사용자 저장/업데이트
    const db = context.env.DB;
    if (!db) return Response.redirect(url.origin + "/?login_error=db_error", 302);

    await initTables(db);

    // UPSERT: 이미 있으면 업데이트, 없으면 삽입
    await db.prepare(`
      INSERT INTO users (provider, provider_id, name, email, phone, profile_image, last_login_at)
      VALUES ('kakao', ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(provider, provider_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        profile_image = excluded.profile_image,
        last_login_at = datetime('now')
    `).bind(kakaoId, name, email, phone, profileImage).run();

    // 사용자 ID 조회
    const user = await db.prepare(
      `SELECT id FROM users WHERE provider = 'kakao' AND provider_id = ?`
    ).bind(kakaoId).first();

    // 4. 세션 생성
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30일

    await db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
    ).bind(sessionToken, user.id, expiresAt).run();

    // 5. 쿠키 설정 후 메인 페이지로 리다이렉트
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.origin + "/",
        "Set-Cookie": `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
      },
    });
  } catch (e) {
    console.error("Kakao auth error:", e);
    return new Response("카카오 로그인 오류: " + e.message, { status: 500 });
  }
}
