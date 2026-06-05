// 사장님 비번(ADMIN_KEY) 진입 시 owner 세션 쿠키 발급 — 한 번 로그인 30일 유지.
//
// 사장님 보고 (2026-06-04): "왜 자꾸 들어갈 때마다 비번 쳐야 됨? 1번만 치면 되는 거 아님?"
//   원인: 옛 admin 은 ADMIN_KEY 를 sessionStorage(탭 닫으면 삭제·탭마다 따로)에만 보관
//        → 새 탭·브라우저 재시작마다 재로그인. (카카오 로그인은 30일 session 쿠키라 자동 유지)
//
// Fix: ADMIN_KEY 가 맞으면 owner(이재윤, user_id=1) 의 session row + session 쿠키(30일) 발급.
//   - 기존 checkAdmin(_adminAuth.js) / admin-whoami 의 "session 쿠키 → owner" 경로가 그대로 자동 로그인
//   - 로그아웃(admin.js logout → /api/auth/logout) 이 session row + 쿠키를 이미 삭제 → 정상 아웃
//     (즉 새 메커니즘 아님 — 카카오 로그인과 똑같은 session 을 ADMIN_KEY 로도 발급하는 것뿐)
//
// 보안: timing-safe 비교 + CSRF Origin 가드. ADMIN_KEY 원문은 저장 안 함(랜덤 토큰 HttpOnly 쿠키).

import { checkOriginCsrf } from './_adminAuth.js';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost(context) {
  /* CSRF — 같은 출처(브라우저)에서만. admin.js 가 same-origin POST. */
  const csrf = checkOriginCsrf(context.request, context.env);
  if (csrf) return csrf;

  const db = context.env.DB;
  const adminKey = context.env.ADMIN_KEY;
  if (!db || !adminKey) {
    return Response.json({ ok: false, error: 'DB / ADMIN_KEY 미설정' }, { status: 500 });
  }

  let body;
  try { body = await context.request.json(); } catch { body = {}; }
  const key = body && body.key;
  if (!key || !timingSafeEqual(String(key), adminKey)) {
    return Response.json({ ok: false, error: '비번이 일치하지 않습니다' }, { status: 401 });
  }

  /* owner 사용자 찾기 — admin_role='owner' 우선, 없으면 user_id=1 + is_admin=1.
   * (checkAdmin 의 owner 판정과 일치: admin_role==='owner' 또는 user_id===1) */
  try { await db.prepare(`ALTER TABLE users ADD COLUMN admin_role TEXT`).run(); } catch {}
  let owner = null;
  try {
    owner = await db
      .prepare(`SELECT id FROM users WHERE admin_role = 'owner' AND (deleted_at IS NULL OR deleted_at = '') ORDER BY id LIMIT 1`)
      .first();
  } catch {}
  if (!owner || !owner.id) {
    try { owner = await db.prepare(`SELECT id FROM users WHERE id = 1 AND is_admin = 1`).first(); } catch {}
  }
  if (!owner || !owner.id) {
    return Response.json({ ok: false, error: 'owner 사용자(이재윤)를 찾을 수 없습니다' }, { status: 500 });
  }

  /* session row + 쿠키 — kakao/naver 로그인과 동일 (token, user_id, expires_at), 30일 */
  try {
    await db
      .prepare(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, expires_at TEXT NOT NULL)`)
      .run();
  } catch {}
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  const maxAge = 30 * 24 * 60 * 60; // 30일
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();
  await db
    .prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(token, owner.id, expiresAt)
    .run();

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append(
    'Set-Cookie',
    `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
  );
  return new Response(JSON.stringify({ ok: true, userId: owner.id }), { status: 200, headers });
}
