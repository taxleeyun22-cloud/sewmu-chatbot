// 네이버 OAuth 콜백 핸들러
import { verifyStateCookie } from "./_oauthState.js";

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
  const addCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await addCol(`ALTER TABLE users ADD COLUMN deleted_at TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN withdrawal_reason TEXT`);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return Response.redirect(url.origin + "/?login_error=cancelled", 302);
  }

  /* CSRF 방어: state 3중 검증 */
  if (!(await verifyStateCookie(context.request, context.env, state))) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.origin + "/?login_error=invalid_state",
        "Set-Cookie": `oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    });
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

    /* 사장님 명령 (2026-05-07): 자동 복구 폐지 (kakao.js 와 동일 패턴) */
    try { await db.prepare(`ALTER TABLE users ADD COLUMN withdrawn_provider_id TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE users ADD COLUMN previous_withdrawn_user_id INTEGER`).run(); } catch {}

    let user = await db.prepare(
      `SELECT id FROM users WHERE provider = 'naver' AND provider_id = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`
    ).bind(naverId).first();

    if (user) {
      await db.prepare(
        `UPDATE users SET name = ?, email = ?, phone = ?, profile_image = ?, last_login_at = datetime('now') WHERE id = ?`
      ).bind(name, email, phone, profileImage, user.id).run();
    } else {
      const prevWithdrawn = await db.prepare(
        `SELECT id FROM users WHERE provider = 'naver' AND withdrawn_provider_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1`
      ).bind(naverId).first();
      const prevId = prevWithdrawn?.id || null;
      const r = await db.prepare(
        `INSERT INTO users (provider, provider_id, name, email, phone, profile_image,
                            approval_status, name_confirmed, previous_withdrawn_user_id,
                            created_at, last_login_at)
         VALUES ('naver', ?, ?, ?, ?, ?, 'pending', 0, ?, datetime('now'), datetime('now'))`
      ).bind(naverId, name, email, phone, profileImage, prevId).run();
      user = { id: r.meta?.last_row_id };
    }

    // 4. 세션 생성
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
    ).bind(sessionToken, user.id, expiresAt).run();

    const headers = new Headers();
    headers.append("Location", url.origin + "/");
    headers.append("Set-Cookie", `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    headers.append("Set-Cookie", `oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    headers.append("Cache-Control", "no-store");
    return new Response(null, { status: 302, headers });
  } catch (e) {
    /* 보안: 내부 에러 미노출 */
    return Response.redirect(url.origin + "/?login_error=server_error", 302);
  }
}
