/**
 * Phase Next-Day27 (2026-05-11): ADMIN_KEY 비번 진입 (사장님 매일 워크플로).
 *
 * 옛 admin.html 방식 — 카톡 OAuth 안 거치고 비번 1줄로 owner 권한 진입.
 *
 * POST /api/admin-login { key: string }
 *   - ADMIN_KEY 일치 → HttpOnly cookie 발급 → owner 권한
 *   - 불일치 → 401
 *
 * 보안:
 *   - HttpOnly + Secure + SameSite=Lax cookie
 *   - 7일 expiry
 *   - 값 = AUTH_SECRET 으로 HMAC 서명 (위조 방지)
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { rateLimit, clientIp, rateLimited } from '@/lib/rate-limit';

export const runtime = 'edge';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** HMAC-SHA256 서명 — cookie 위조 방지. */
async function signToken(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

export async function POST(request: Request) {
  try {
    /* Cloudflare Pages binding 접근 — next-on-pages 표준 */
    let env: any;
    try {
      env = getRequestContext().env;
    } catch {
      env = (globalThis as any).env || (process as any)?.env || {};
    }

    /* Phase 14 (2026-05-12): brute-force 방어 — IP 당 10/min.
     * 사장님 정상 사용 (하루 1-2회 로그인) 영향 0. 공격자 봇만 차단. */
    const ip = clientIp(request);
    const rl = await rateLimit(env.DB, `admin-login:${ip}`, 10, 60);
    if (!rl.ok) {
      return rateLimited(rl.retryAfter || 60, 10);
    }

    const body = await request.json().catch(() => ({}));
    const key = (body as { key?: string }).key;

    const expectedKey = env.ADMIN_KEY;
    const authSecret = env.AUTH_SECRET;

    if (!expectedKey || !authSecret) {
      return NextResponse.json(
        { ok: false, error: 'ADMIN_KEY / AUTH_SECRET 미설정' },
        { status: 500 },
      );
    }

    if (!key || key !== expectedKey) {
      return NextResponse.json(
        { ok: false, error: '비번이 일치하지 않습니다' },
        { status: 401 },
      );
    }

    /* 서명 토큰: "owner:{timestamp}" + HMAC */
    const payload = `owner:${Date.now()}`;
    const signed = await signToken(payload, authSecret);

    const cookieStore = await cookies();
    cookieStore.set('admin_key_auth', signed, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 86400, // 7일
      path: '/',
    });

    return NextResponse.json({ ok: true, redirect: '/admin/dashboard' });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
