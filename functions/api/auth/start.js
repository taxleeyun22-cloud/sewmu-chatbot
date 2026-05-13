// OAuth 시작점 — state 발급 + 쿠키 세팅 + 공급자로 리다이렉트
// 사용: GET /api/auth/start?provider=kakao (또는 naver)
//
// 보안:
// - state는 HMAC 서명된 nonce. 쿠키와 쿼리 둘 다 일치해야 검증 통과.
// - oauth_state 쿠키는 HttpOnly + Secure + SameSite=Lax + 짧은 TTL(10분)

import { createState } from "./_oauthState.js";
import { rateLimit, getClientIP } from "../_ratelimit.js";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const provider = (url.searchParams.get("provider") || "").toLowerCase();

  if (provider !== "kakao" && provider !== "naver") {
    return new Response("invalid provider", { status: 400 });
  }

  /* Rate limit: IP당 1분 30회 (로그인 버튼 난타·봇 방어) */
  const ip = getClientIP(context.request);
  const rl = await rateLimit(context.env.DB, `auth_start:${ip}`, 30, 60);
  if (!rl.ok) {
    return new Response("너무 많은 요청", {
      status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) }
    });
  }

  const state = await createState(context.env);
  const redirectUri = url.origin + "/api/auth/" + provider;

  /* Phase 16 (2026-05-13) 사장님 명령 "다른 계정 로그인":
   * prompt=login → 카카오 OAuth 매번 로그인 화면 표시 (자동 로그인 무시) → 다른 카톡 계정 입력 가능.
   * 카카오 OAuth 2.0 표준 파라미터. accounts.kakao.com/logout 시도 X (잘못된 요청 에러). */
  const prompt = url.searchParams.get("prompt");
  const forceLogin = prompt === "login";

  let authUrl;
  if (provider === "kakao") {
    const cid = context.env.KAKAO_CLIENT_ID || "";
    const params = {
      client_id: cid,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    };
    if (forceLogin) params.prompt = "login";
    authUrl = "https://kauth.kakao.com/oauth/authorize?" + new URLSearchParams(params);
  } else {
    const cid = context.env.NAVER_CLIENT_ID || "";
    const params = {
      client_id: cid,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    };
    if (forceLogin) params.auth_type = "reauthenticate";  /* 네이버 OAuth 표준 */
    authUrl = "https://nid.naver.com/oauth2.0/authorize?" + new URLSearchParams(params);
  }

  /* 10분 유효 쿠키. HttpOnly로 JS에서 접근 불가 */
  const stateCookie = `oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;

  /* Phase 16 (2026-05-13): from=admin 파라미터 처리 — admin 페이지에서 카카오 로그인 시
   * callback 이 admin 페이지로 redirect 해야 함. cookie 로 의도 저장 (10분 TTL). */
  const from = (url.searchParams.get("from") || "").toLowerCase();
  const fromCookie =
    from === "admin"
      ? `oauth_from=admin; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
      : null;

  const headers = new Headers();
  headers.set("Location", authUrl);
  headers.append("Set-Cookie", stateCookie);
  if (fromCookie) headers.append("Set-Cookie", fromCookie);
  headers.set("Cache-Control", "no-store");

  return new Response(null, { status: 302, headers });
}
