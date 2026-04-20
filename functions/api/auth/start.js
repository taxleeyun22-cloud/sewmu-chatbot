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

  let authUrl;
  if (provider === "kakao") {
    const cid = context.env.KAKAO_CLIENT_ID || "";
    authUrl = "https://kauth.kakao.com/oauth/authorize?"
      + new URLSearchParams({
          client_id: cid,
          redirect_uri: redirectUri,
          response_type: "code",
          state,
        });
  } else {
    const cid = context.env.NAVER_CLIENT_ID || "";
    authUrl = "https://nid.naver.com/oauth2.0/authorize?"
      + new URLSearchParams({
          client_id: cid,
          redirect_uri: redirectUri,
          response_type: "code",
          state,
        });
  }

  /* 10분 유효 쿠키. HttpOnly로 JS에서 접근 불가 */
  const cookie = `oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}
