/**
 * Phase Next-Day27 (2026-05-11): apps/admin middleware.
 *
 * 진입 단계 2가지 인증:
 * 1. admin_key_auth cookie (사장님 비번 진입) — 옛 admin.html 방식
 * 2. Auth.js session (직원 + 거래처 카톡 OAuth)
 *
 * 둘 다 없으면 → /login 으로 redirect.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/admin/:path*'],
};

export default async function middleware(req: NextRequest) {
  /* 1. admin_key cookie 검증 (사장님 비번 진입) */
  const adminCookie = req.cookies.get('admin_key_auth');
  if (adminCookie?.value) {
    /* cookie 존재 만 확인 — 서명 검증은 tRPC ctx 에서 (edge runtime 빠른 통과) */
    return NextResponse.next();
  }

  /* 2. Auth.js session cookie 검증 — 카톡 로그인 사용자 */
  const authSessionCookie =
    req.cookies.get('authjs.session-token') ||
    req.cookies.get('__Secure-authjs.session-token');

  if (authSessionCookie?.value) {
    return NextResponse.next();
  }

  /* 둘 다 없으면 → 로그인 페이지 */
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
