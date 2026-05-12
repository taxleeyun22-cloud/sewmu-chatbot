/**
 * Phase 10 cleanup (2026-05-12): e2e 인증 fixture — POST /api/admin-login 으로
 * 실 HMAC 서명 cookie 받음.
 *
 * 사용:
 *   E2E_ADMIN_KEY=실제키 npm run e2e
 *
 * 미설정 시 HAS_ADMIN_KEY=false — 인증 필요한 spec 은 자동 skip.
 */
import type { BrowserContext } from '@playwright/test';

export const HAS_ADMIN_KEY = !!process.env.E2E_ADMIN_KEY;

const BASE = process.env.E2E_BASE_URL || 'https://sewmu-admin.pages.dev';

/**
 * 실 admin_key_auth cookie 를 받아서 context 에 주입.
 * `POST /api/admin-login` (옛 admin endpoint) → Set-Cookie HMAC 서명값 반환.
 */
export async function setupAdminAuth(context: BrowserContext): Promise<void> {
  if (!HAS_ADMIN_KEY) {
    throw new Error('E2E_ADMIN_KEY 미설정 — setupAdminAuth 호출 전에 HAS_ADMIN_KEY 가드 필요');
  }
  const r = await fetch(`${BASE}/api/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: process.env.E2E_ADMIN_KEY }),
  });
  if (!r.ok) {
    throw new Error(`admin-login failed: ${r.status} — E2E_ADMIN_KEY 가 prod ADMIN_KEY 와 일치하는지 확인`);
  }
  const setCookie = r.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('admin-login 응답에 Set-Cookie 없음');
  }
  /* Set-Cookie 파싱 — name=value; Domain=...; Path=...; Secure; HttpOnly */
  const [pair] = setCookie.split(';');
  const [name, value] = pair.split('=');
  await context.addCookies([
    {
      name: name.trim(),
      value: value.trim(),
      domain: new URL(BASE).hostname,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
}
