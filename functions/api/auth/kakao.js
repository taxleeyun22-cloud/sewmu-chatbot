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

    /* Phase 16 (2026-05-13) 사장님 명령 "근본적 이유 해라":
     * 사장님 카카오 email 매칭 → user_id=1 (이재윤, is_admin=1, admin_role='owner') 으로 강제 link.
     * 이후 카카오 ID 와 user_id=1 매칭 자동.
     *
     * 사장님 카카오 email: wodbs330@daum.net (스크린샷 확인).
     * 환경변수 OWNER_KAKAO_EMAIL 로 override 가능. */
    const OWNER_KAKAO_EMAIL = (context.env.OWNER_KAKAO_EMAIL || 'wodbs330@daum.net').toLowerCase();
    if (email && email.toLowerCase() === OWNER_KAKAO_EMAIL) {
      try {
        /* 옛 row 의 provider_id 충돌 방지 — 기존 kakao_id row 가 있으면 null 처리. */
        await db.prepare(
          `UPDATE users SET provider_id = NULL WHERE provider = 'kakao' AND provider_id = ? AND id != 1`
        ).bind(kakaoId).run();
        await db.prepare(
          `UPDATE users SET
             provider = 'kakao',
             provider_id = ?,
             is_admin = 1,
             admin_role = COALESCE(NULLIF(admin_role, ''), 'owner'),
             approval_status = 'approved_client',
             email = COALESCE(NULLIF(email, ''), ?),
             phone = COALESCE(NULLIF(phone, ''), ?),
             profile_image = COALESCE(profile_image, ?),
             last_login_at = datetime('now', '+9 hours')
           WHERE id = 1`
        ).bind(kakaoId, email, phone, profileImage).run();
      } catch {
        /* 사장님 카카오 link 실패해도 일반 흐름 fallback — 작업 차단 X */
      }
    }

    /* 사장님 대원칙 (2026-05-07): 같은 카톡 ID = 1 user only.
     * 매칭 우선순위:
     * 1. 활성 user (deleted_at NULL, provider_id = KAKAO_ID) → 정상 로그인
     * 2. 옛 탈퇴자 (withdrawn_provider_id = KAKAO_ID) → 부활 + 'rejoined'
     * 3. 합쳐진 옛 user (user_merges audit log 의 kakao_snapshot 매칭) → 살아남은 user 로 자동 진입
     * 4. 어디서도 매칭 X → 새 user INSERT */
    try { await db.prepare(`ALTER TABLE users ADD COLUMN withdrawn_provider_id TEXT`).run(); } catch {}

    /* 사장님 명령 (2026-05-08): "카카오 재로그인하면 다시 기록매칭되어야지".
     * 1단계 매칭에서 deleted_at filter 제거 → deleted user 도 매칭 + 자동 복구.
     * approval_status='deleted' 면 'approved_client' 로 복구. business_members 매핑 자동 revive. */
    let user = await db.prepare(
      `SELECT id, deleted_at, approval_status FROM users WHERE provider = 'kakao' AND provider_id = ? LIMIT 1`
    ).bind(kakaoId).first();

    if (user) {
      if (user.deleted_at && user.deleted_at !== '') {
        /* 사장님 의도: 자동 부활 + 매핑 자동 revive */
        const newStatus = user.approval_status === 'deleted' ? 'approved_client' : (user.approval_status || 'approved_client');
        await db.prepare(`
          UPDATE users SET
            deleted_at = NULL,
            approval_status = ?,
            name = ?, email = ?, phone = ?, profile_image = ?,
            last_login_at = datetime('now', '+9 hours')
          WHERE id = ?
        `).bind(newStatus, name, email, phone, profileImage, user.id).run();
        /* business_members 자동 revive */
        try {
          await db.prepare(
            `UPDATE business_members SET removed_at = NULL WHERE user_id = ? AND removed_at IS NOT NULL`
          ).bind(user.id).run();
        } catch {}
      } else {
        /* 정상 로그인 (정보 갱신) */
        await db.prepare(
          `UPDATE users SET name = ?, email = ?, phone = ?, profile_image = ?, last_login_at = datetime('now', '+9 hours') WHERE id = ?`
        ).bind(name, email, phone, profileImage, user.id).run();
      }
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
        /* 3. 합쳐진 옛 user audit log 검색 — 정확한 카톡 ID 만 매칭, admin user 는 redirect 안 함 */
        let mergedSurvivorId = null;
        try {
          const merges = await db.prepare(
            `SELECT manual_user_id, kakao_snapshot FROM user_merges WHERE unmerged_at IS NULL ORDER BY merged_at DESC LIMIT 100`
          ).all();
          for (const m of (merges.results || [])) {
            try {
              const snap = JSON.parse(m.kakao_snapshot || '{}');
              const snapPid = String(snap.provider_id || snap.provider_user_id || '').trim();
              if (snapPid && snapPid === String(kakaoId).trim()) {
                /* 살아남은 user 활성 + 일반 user (admin 제외) 인지 확인 */
                const surv = await db.prepare(
                  `SELECT id FROM users WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '') AND COALESCE(is_admin, 0) = 0 LIMIT 1`
                ).bind(m.manual_user_id).first();
                if (surv) { mergedSurvivorId = surv.id; break; }
              }
            } catch {}
          }
        } catch {}

        if (mergedSurvivorId) {
          /* 합쳐진 옛 카카오 ID → 살아남은 user 로 진입 */
          await db.prepare(
            `UPDATE users SET name = ?, email = ?, phone = COALESCE(phone, ?), profile_image = COALESCE(?, profile_image), last_login_at = datetime('now', '+9 hours') WHERE id = ?`
          ).bind(name, email, phone, profileImage, mergedSurvivorId).run();
          user = { id: mergedSurvivorId };
        } else {
          /* 4a. Phase 16 fix (2026-05-13): 신규 INSERT 전에 email/phone 매칭으로
           * 기존 user link 시도. 사장님 보고: 카카오 로그인 → 관리자 페이지 진입 안 됨.
           * Root cause: 사장님 이재윤 (is_admin=1) row 의 provider_id 가 사장님 카카오 ID 와 다름
           * → 신규 row 로 INSERT (is_admin=0) → admin login 화면 회귀.
           * Fix: email/phone 매칭하는 활성 user 가 있고 provider_id 미설정/다름이면 link 만 (is_admin 변경 X). */
          let linkedUser = null;
          if (email || phone) {
            try {
              const conditions = [];
              const params = [];
              if (email) { conditions.push("LOWER(email) = LOWER(?)"); params.push(email); }
              if (phone) { conditions.push("REPLACE(phone, '-', '') = REPLACE(?, '-', '')"); params.push(phone); }
              if (conditions.length) {
                const candidate = await db.prepare(
                  `SELECT id, provider_id, is_admin FROM users
                   WHERE (${conditions.join(' OR ')})
                     AND (deleted_at IS NULL OR deleted_at = '')
                     AND COALESCE(approval_status, 'pending') NOT IN ('merged', 'deleted', 'withdrawn')
                   ORDER BY COALESCE(is_admin, 0) DESC, id ASC
                   LIMIT 1`
                ).bind(...params).first();
                if (candidate?.id) {
                  /* provider_id update + last_login_at — is_admin 은 그대로 (자동 승급 금지) */
                  await db.prepare(
                    `UPDATE users SET
                       provider = 'kakao', provider_id = ?,
                       name = COALESCE(NULLIF(name, ''), ?),
                       email = COALESCE(NULLIF(email, ''), ?),
                       phone = COALESCE(NULLIF(phone, ''), ?),
                       profile_image = COALESCE(profile_image, ?),
                       last_login_at = datetime('now', '+9 hours')
                     WHERE id = ?`
                  ).bind(kakaoId, name, email, phone, profileImage, candidate.id).run();
                  linkedUser = { id: candidate.id };
                }
              }
            } catch {
              /* 매칭 실패해도 신규 INSERT 로 fallback — 사장님 작업 차단 X */
            }
          }

          if (linkedUser) {
            user = linkedUser;
          } else {
            /* 4b. 진짜 새 user INSERT — legacy provider_id NOT NULL 처리 */
            let hasProviderUserIdCol = false;
            try {
              const info = await db.prepare(`PRAGMA table_info(users)`).all();
              hasProviderUserIdCol = (info?.results || []).some(c => c.name === 'provider_user_id');
            } catch {}
            let r;
            if (hasProviderUserIdCol) {
              r = await db.prepare(
                `INSERT INTO users (provider, provider_id, provider_user_id, name, email, phone, profile_image,
                                    approval_status, name_confirmed,
                                    created_at, last_login_at)
                 VALUES ('kakao', ?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`
              ).bind(kakaoId, kakaoId, name, email, phone, profileImage).run();
            } else {
              r = await db.prepare(
                `INSERT INTO users (provider, provider_id, name, email, phone, profile_image,
                                    approval_status, name_confirmed,
                                    created_at, last_login_at)
                 VALUES ('kakao', ?, ?, ?, ?, ?, 'pending', 0, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`
              ).bind(kakaoId, name, email, phone, profileImage).run();
            }
            user = { id: r.meta?.last_row_id };
          }
        }
      }
    }

    // 4. 세션 생성
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30일

    await db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
    ).bind(sessionToken, user.id, expiresAt).run();

    /* Phase 16 (2026-05-13): from=admin cookie 읽어서 admin 사용자면 admin 페이지로.
     * 그 외 거래처 메인 (`/`).
     * 사장님 보고: 옛 admin login → 카카오 로그인 했더니 거래처 챗봇으로 가서 admin 진입 안 됨.
     *
     * 분기:
     * - oauth_from=admin AND user.is_admin=1  → /admin (관리자 화면)
     * - oauth_from=admin AND user.is_admin=0  → / 거래처. (관리자 등록 필요 안내 메시지)
     * - oauth_from 없음                       → / 거래처 (default) */
    const fromCookie = (context.request.headers.get("Cookie") || "")
      .match(/oauth_from=([^;]+)/)?.[1];
    let isAdminUser = 0;
    try {
      const u = await db.prepare(`SELECT is_admin FROM users WHERE id = ?`).bind(user.id).first();
      isAdminUser = Number(u?.is_admin || 0);
    } catch {}

    let location = url.origin + "/";
    if (fromCookie === "admin") {
      if (isAdminUser === 1) {
        location = url.origin + "/admin";
      } else {
        /* 카카오는 인증됐지만 admin 권한 없음 — 거래처 메인으로 + 안내 query */
        location = url.origin + "/?login_warn=not_admin";
      }
    }

    const headers = new Headers();
    headers.append("Location", location);
    headers.append("Set-Cookie", `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    headers.append("Set-Cookie", `oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    /* oauth_from cookie 도 즉시 삭제 — 한 번 쓰고 폐기 */
    headers.append("Set-Cookie", `oauth_from=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    headers.append("Cache-Control", "no-store");
    return new Response(null, { status: 302, headers });
  } catch (e) {
    /* 보안: 스택·에러 메시지를 사용자에게 노출하지 않고 중립 리다이렉트 */
    console.error("Kakao auth error:", e);
    return Response.redirect(url.origin + "/?login_error=server_error", 302);
  }
}
