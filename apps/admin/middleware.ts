/**
 * Phase Next-Day28 (2026-05-11): apps/admin middleware.
 *
 * 사장님 명령 (2026-05-11): "옛 admin 한 큐에 복사" — apps/admin/public/admin.html 그대로 사용.
 *
 * 진입 단계 3가지 인증:
 * 1. admin_key_auth cookie (새 admin 비번 진입)
 * 2. admin_key cookie (옛 admin _adminAuth.js 방식)
 * 3. Auth.js session (직원 + 거래처 카톡 OAuth)
 *
 * 모두 없으면 → /login 으로 redirect.
 *
 * matcher 는 /admin/:path* 만 — /admin.html 같은 정적 파일은 _adminAuth.js 가 처리.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/admin/:path*'],
};

export default async function middleware(req: NextRequest) {
  /* 1. admin_key_auth cookie (새 admin 비번 진입) */
  const adminCookie = req.cookies.get('admin_key_auth');
  if (adminCookie?.value) {
    return NextResponse.next();
  }

  /* 2. admin_key cookie (옛 admin _adminAuth.js 방식) */
  const oldAdminCookie = req.cookies.get('admin_key');
  if (oldAdminCookie?.value) {
    return NextResponse.next();
  }

  /* 3. Auth.js session cookie 검증 — 카톡 로그인 사용자 */
  const authSessionCookie =
    req.cookies.get('authjs.session-token') ||
    req.cookies.get('__Secure-authjs.session-token');

  if (authSessionCookie?.value) {
    return NextResponse.next();
  }

  /* Phase 16 (2026-05-13) 사장님 보고: 카카오 로그인 후 새로고침 시 admin 튕김.
   * 진짜 원인: kakao.js / naver.js callback 이 set 하는 옛 `session` cookie 를
   * middleware 가 인식 안 함 → /login redirect → 사장님 회귀.
   * Fix: 4번째 인증 — 옛 session cookie 존재만 체크 (DB 검증은 API endpoint 의
   *      checkAdmin 이 강제). middleware 는 단순 진입 가드만. */
  const oldSessionCookie = req.cookies.get('session');
  if (oldSessionCookie?.value) {
    return NextResponse.next();
  }

  /* 모두 없으면 → 로그인 페이지 */
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
