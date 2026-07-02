// 사장님 비번(ADMIN_KEY) 진입 시 owner 인증 쿠키 발급 — 한 번 로그인 30일 유지.
//
// 사장님 보고 (2026-06-04~05): "왜 자꾸 들어갈 때마다 비번 쳐야 됨? 1번만 치면 되는 거 아님?"
//   원인: 옛 admin 은 ADMIN_KEY 를 sessionStorage(탭 닫으면 삭제·탭마다 따로)에만 보관
//        → 새 탭·브라우저 재시작마다 재로그인. (영업 타겟에서 거래처 클릭 → 새 탭 → 로그인벽도 같은 원인)
//
// Fix: 새 admin(/api/admin-login)과 동일한 HMAC 서명 쿠키(admin_key_auth) 발급.
//   - _adminAuth.js checkAdmin 이 이 쿠키를 검증 → owner (특정 user row 불필요 = 키 기반 owner 그대로 유지)
//   - admin-whoami 가 checkAdmin 사용 → admin.js 쿠키 fallback 자동 로그인
//   - 로그아웃(/api/auth/logout)이 이 쿠키 삭제 → 정상 아웃 (저번 사고 재발 X)
//
// 보안: timing-safe 비교 + CSRF Origin 가드. ADMIN_KEY 원문 저장 X (HMAC 서명 HttpOnly 쿠키, 30일).

import { checkOriginCsrf } from './_adminAuth.js';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256 서명 토큰 — "owner:{timestamp}.{base64(sig)}" (새 admin admin-login 과 동일 포맷). */
async function signOwnerToken(secret) {
  const payload = `owner:${Date.now()}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

export async function onRequestPost(context) {
  const csrf = checkOriginCsrf(context.request, context.env);
  if (csrf) return csrf;

  /* HMAC 서명 secret = ADMIN_KEY (옛 admin 에 확실히 설정됨. AUTH_SECRET 은 sewmu-chatbot 에
   * 미설정이라 못 씀). ADMIN_KEY 로 서명 → ADMIN_KEY 모르면 위조 불가(동일 보안). 토큰엔 키 원문 없음. */
  const adminKey = context.env.ADMIN_KEY;
  if (!adminKey) {
    return Response.json({ ok: false, error: 'ADMIN_KEY 미설정' }, { status: 500 });
  }

  let body;
  try { body = await context.request.json(); } catch { body = {}; }
  const key = body && body.key;
  if (!key || !timingSafeEqual(String(key), adminKey)) {
    return Response.json({ ok: false, error: '비번이 일치하지 않습니다' }, { status: 401 });
  }

  const token = await signOwnerToken(adminKey);
  const maxAge = 30 * 24 * 60 * 60; // 30일
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append(
    'Set-Cookie',
    `admin_key_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
  );
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
