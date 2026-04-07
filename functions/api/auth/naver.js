// 네이버 OAuth 콜백 핸들러
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
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return Response.redirect(url.origin + "/?login_error=cancelled", 302);
  }

  const clientId = context.env.NAVER_CLIENT_ID;
  const clientSecret = context.env.NAVER_CLIENT_SECRET;

  try {
    // 1. 인가 코드로 토큰 발급
    const tokenRes = await fetch("https://nid.naver.com/oauth2.0/token?" + new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      state: state || "",
    }));
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return Response.redirect(url.origin + "/?login_error=token_failed", 302);
    }

    // 2. 사용자 정보 조회
    const userRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const userData = await userRes.json();
    const response = userData.response || {};

    const naverId = response.id || "";
    const name = response.name || response.nickname || "";
    const email = response.email || "";
    const phone = (response.mobile || "").replace(/-/g, "").replace(/^\+82/, "0");
    const profileImage = response.profile_image || "";

    // 3. DB에 사용자 저장/업데이트
    const db = context.env.DB;
    if (!db) return Response.redirect(url.origin + "/?login_error=db_error", 302);

    await initTables(db);

    await db.prepare(`
      INSERT INTO users (provider, provider_id, name, email, phone, profile_image, last_login_at)
      VALUES ('naver', ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(provider, provider_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        profile_image = excluded.profile_image,
        last_login_at = datetime('now')
    `).bind(naverId, name, email, phone, profileImage).run();

    const user = await db.prepare(
      `SELECT id FROM users WHERE provider = 'naver' AND provider_id = ?`
    ).bind(naverId).first();

    // 4. 세션 생성
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

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
    console.error("Naver auth error:", e);
    return Response.redirect(url.origin + "/?login_error=server_error", 302);
  }
}
