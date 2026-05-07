// 카카오 OAuth 콜백 핸들러
import { verifyStateCookie } from "./_oauthState.js";

async function initTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      name TEXT,
      real_name TEXT,
      email TEXT,
      phone TEXT,
      profile_image TEXT,
      approval_status TEXT DEFAULT 'pending',
      approved_at TEXT,
      approved_by TEXT,
      rejection_reason TEXT,
      name_confirmed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+9 hours')),
      last_login_at TEXT DEFAULT (datetime('now', '+9 hours')),
      UNIQUE(provider, provider_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_usage (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, date)
    )`)
  ]);
  // 기존 테이블에 컬럼 추가 (이미 있는 배포 환경 대응)
  const addCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await addCol(`ALTER TABLE users ADD COLUMN real_name TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'pending'`);
  await addCol(`ALTER TABLE users ADD COLUMN approved_at TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN approved_by TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN rejection_reason TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN name_confirmed INTEGER DEFAULT 0`);
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

  /* CSRF 방어: state 쿠키 + 쿼리 + HMAC 3중 검증 */
  if (!(await verifyStateCookie(context.request, context.env, state))) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.origin + "/?login_error=invalid_state",
        "Set-Cookie": `oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  const clientId = context.env.KAKAO_CLIENT_ID;
  const clientSecret = context.env.KAKAO_CLIENT_SECRET;
  const redirectUri = url.origin + "/api/auth/kakao";

  try {
    // 1. 인가 코드로 토큰 발급
    const clientSecret = context.env.KAKAO_CLIENT_SECRET;
    const tokenParams = {
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code: code,
    };
    if (clientSecret) tokenParams.client_secret = clientSecret;

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      /* 보안: client_id·redirect_uri·공급자 응답 원문을 사용자에게 노출하지 않음 */
      return Response.redirect(url.origin + "/?login_error=token_failed", 302);
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

    /* 사장님 대원칙 (2026-05-07): 같은 카톡 ID = 1 user only.
     * 매칭 우선순위:
     * 1. 활성 user (deleted_at NULL, provider_id = KAKAO_ID) → 정상 로그인
     * 2. 옛 탈퇴자 (withdrawn_provider_id = KAKAO_ID) → 부활 + 'rejoined'
     * 3. 합쳐진 옛 user (user_merges audit log 의 kakao_snapshot 매칭) → 살아남은 user 로 자동 진입
     * 4. 어디서도 매칭 X → 새 user INSERT */
    try { await db.prepare(`ALTER TABLE users ADD COLUMN withdrawn_provider_id TEXT`).run(); } catch {}

    /* 1. 활성 user 매칭 */
    let user = await db.prepare(
      `SELECT id FROM users WHERE provider = 'kakao' AND provider_id = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`
    ).bind(kakaoId).first();

    if (user) {
      /* 정상 로그인 (정보 갱신) */
      await db.prepare(
        `UPDATE users SET name = ?, email = ?, phone = ?, profile_image = ?, last_login_at = datetime('now', '+9 hours') WHERE id = ?`
      ).bind(name, email, phone, profileImage, user.id).run();
    } else {
      /* 2. 옛 탈퇴자 부활 (withdrawn_provider_id 매칭) */
      const withdrawnUser = await db.prepare(
        `SELECT id FROM users WHERE provider = 'kakao' AND withdrawn_provider_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1`
      ).bind(kakaoId).first();

      if (withdrawnUser) {
        await db.prepare(`
          UPDATE users SET
            deleted_at = NULL,
            withdrawal_reason = NULL,
            approval_status = 'rejoined',
            provider_id = ?,
            provider_user_id = ?,
            withdrawn_provider_id = NULL,
            name = ?, email = ?, phone = ?, profile_image = ?,
            last_login_at = datetime('now', '+9 hours')
          WHERE id = ?
        `).bind(kakaoId, kakaoId, name, email, phone, profileImage, withdrawnUser.id).run();
        user = { id: withdrawnUser.id };
      } else {
        /* 3. 합쳐진 옛 user audit log 검색 (kakao_snapshot.provider_id = KAKAO_ID) */
        let mergedSurvivorId = null;
        try {
          const merges = await db.prepare(
            `SELECT manual_user_id, kakao_snapshot FROM user_merges WHERE unmerged_at IS NULL ORDER BY merged_at DESC LIMIT 100`
          ).all();
          for (const m of (merges.results || [])) {
            try {
              const snap = JSON.parse(m.kakao_snapshot || '{}');
              if (String(snap.provider_id || '') === String(kakaoId) || String(snap.provider_user_id || '') === String(kakaoId)) {
                /* 살아남은 user 가 활성 (deleted_at NULL) 인지 확인 */
                const surv = await db.prepare(
                  `SELECT id FROM users WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`
                ).bind(m.manual_user_id).first();
                if (surv) { mergedSurvivorId = surv.id; break; }
              }
            } catch {}
          }
        } catch {}

        if (mergedSurvivorId) {
          /* 합쳐진 옛 카카오 ID → 살아남은 user 로 진입 (정보 갱신만) */
          await db.prepare(
            `UPDATE users SET name = ?, email = ?, phone = COALESCE(phone, ?), profile_image = COALESCE(?, profile_image), last_login_at = datetime('now', '+9 hours') WHERE id = ?`
          ).bind(name, email, phone, profileImage, mergedSurvivorId).run();
          user = { id: mergedSurvivorId };
        } else {
          /* 4. 진짜 새 user INSERT */
          const r = await db.prepare(
            `INSERT INTO users (provider, provider_id, name, email, phone, profile_image,
                                approval_status, name_confirmed,
                                created_at, last_login_at)
             VALUES ('kakao', ?, ?, ?, ?, ?, 'pending', 0, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`
          ).bind(kakaoId, name, email, phone, profileImage).run();
          user = { id: r.meta?.last_row_id };
        }
      }
    }

    // 4. 세션 생성
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30일

    await db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
    ).bind(sessionToken, user.id, expiresAt).run();

    // 5. 쿠키 설정 후 메인 페이지로 리다이렉트 (+ oauth_state 쿠키 즉시 삭제)
    const headers = new Headers();
    headers.append("Location", url.origin + "/");
    headers.append("Set-Cookie", `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    headers.append("Set-Cookie", `oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    headers.append("Cache-Control", "no-store");
    return new Response(null, { status: 302, headers });
  } catch (e) {
    /* 보안: 스택·에러 메시지를 사용자에게 노출하지 않고 중립 리다이렉트 */
    console.error("Kakao auth error:", e);
    return Response.redirect(url.origin + "/?login_error=server_error", 302);
  }
}
