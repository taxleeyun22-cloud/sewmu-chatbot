// OAuth state 서명·검증 유틸
// HMAC-SHA256 기반. 서버 상태 없이 단방향 검증만 수행.
// state = base64url(random(16)) + '.' + base64url(hmac(secret, random))

function b64u(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64uDecode(str) {
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacSign(secret, dataStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dataStr));
  return b64u(sig);
}

function pickSecret(env) {
  /* ADMIN_KEY 를 파생 키로 재사용 (별도 env 추가 없이 동작). 없으면 랜덤 고정값으로 폴백. */
  return env.OAUTH_STATE_SECRET || env.ADMIN_KEY || 'sewmu-oauth-fallback-' + (env.KAKAO_CLIENT_ID || '');
}

export async function createState(env) {
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  const nonce = b64u(rand);
  const sig = await hmacSign(pickSecret(env), nonce);
  return `${nonce}.${sig}`;
}

export async function verifyState(env, state) {
  if (!state || typeof state !== 'string') return false;
  const parts = state.split('.');
  if (parts.length !== 2) return false;
  const [nonce, sig] = parts;
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(nonce) || !/^[A-Za-z0-9_-]{20,60}$/.test(sig)) return false;
  const expected = await hmacSign(pickSecret(env), nonce);
  /* timing-safe */
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/* 쿠키에서 oauth_state 파싱·검증·즉시 소비 */
export async function verifyStateCookie(request, env, stateFromQuery) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/oauth_state=([^;]+)/);
  if (!m) return false;
  const cookieState = decodeURIComponent(m[1]);
  /* 쿠키 값과 쿼리 값이 정확히 일치 + HMAC 검증 */
  if (cookieState !== stateFromQuery) return false;
  return await verifyState(env, stateFromQuery);
}
