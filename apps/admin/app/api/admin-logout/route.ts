/**
 * Phase Next-Day27 (2026-05-11): 로그아웃 — admin_key_auth cookie 삭제.
 *
 * 사장님 비번 진입 cookie + Auth.js session 둘 다 정리.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST() {
  const cookieStore = await cookies();
  /* admin_key_auth (사장님 비번 진입) 삭제 */
  cookieStore.delete('admin_key_auth');
  /* Auth.js session token 도 같이 정리 (있을 시) */
  cookieStore.delete('authjs.session-token');
  cookieStore.delete('__Secure-authjs.session-token');
  return NextResponse.json({ ok: true, redirect: '/login' });
}

/* GET 도 동일하게 처리 — 사이드바 link 클릭 시 단순 진입용 */
export async function GET() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_key_auth');
  cookieStore.delete('authjs.session-token');
  cookieStore.delete('__Secure-authjs.session-token');
  return NextResponse.redirect(new URL('/login', 'https://sewmu-admin.pages.dev'));
}
