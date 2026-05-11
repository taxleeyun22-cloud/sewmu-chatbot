/**
 * Phase Next-Day27 (2026-05-11): apps/admin middleware.
 *
 * 모든 /admin/* 요청 진입 시 자동 차단:
 * - 비로그인 → /login
 * - is_admin=0 → customer URL 으로 redirect
 * - is_admin=1 → 통과
 *
 * Stripe / GitHub 패턴 — 도메인 진입 단계에서 권한 차단.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from './auth';

export const config = {
  /* /admin/* 만 보호. /api/* 는 라우터 내부에서 차단 (publicProcedure / adminProcedure). */
  matcher: ['/admin/:path*'],
};

export default async function middleware(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    /* 비로그인 → /login + 원래 path 보존 (로그인 후 돌아오기). */
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  /* DB 접근은 middleware 에서 직접 X (Edge runtime, D1 binding 미보장).
   * is_admin 체크는 페이지 layout 또는 server component 에서 (Auth.js session 의 user 정보 활용).
   * 여기서는 단순 인증만 — 비로그인 차단.
   *
   * 향후: NextAuth callback 에서 session.user.isAdmin / isOwner 박기 → middleware 에서 체크 가능.
   */
  return NextResponse.next();
}
