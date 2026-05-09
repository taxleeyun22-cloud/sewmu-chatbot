/**
 * Phase Next-Day15 (2026-05-09): Auth.js v5 — apps/customer-web 진입점.
 *
 * Cloudflare Pages Edge runtime 호환.
 * D1 binding (env.DB) → Drizzle adapter → users/accounts/sessions 테이블.
 *
 * 사용 (서버 컴포넌트):
 *   import { auth } from '@/auth';
 *   const session = await auth();
 *   if (session?.user?.id) { ... }
 *
 * 사용 (Route handler):
 *   import { handlers } from '@/auth';
 *   export const { GET, POST } = handlers;
 *
 * Cloudflare 환경변수:
 *   AUTH_SECRET           — openssl rand -base64 32
 *   KAKAO_CLIENT_ID       — 카카오 dev console
 *   KAKAO_CLIENT_SECRET   — 카카오 dev console
 *   NAVER_CLIENT_ID       — 네이버 dev center (옵션)
 *   NAVER_CLIENT_SECRET   — 네이버 dev center (옵션)
 *   AUTH_URL              — https://customer.sewmu.app (Cloudflare Pages 배포 URL)
 */
import NextAuth from 'next-auth';
import { buildAuthConfig } from '@sewmu/auth';
import { drizzle } from '@sewmu/db/client';
import * as schema from '@sewmu/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cloudflare D1 binding 은 request context 에서 only 접근 가능.
 * Auth.js v5 는 next/cache 통해 module-scope 호출 패턴 — 향후 wrap 필요.
 *
 * 현재 (Day 15): 모듈 레벨 config build 시 env 직접 접근 X.
 * 대신 handlers 안에서 매 요청마다 build (Edge runtime 안전).
 */
function getEnv() {
  // Cloudflare Pages Edge runtime: process.env or globalThis 의 binding context
  const env = (globalThis as any).env || (process as any)?.env || {};
  return {
    AUTH_SECRET: env.AUTH_SECRET,
    KAKAO_CLIENT_ID: env.KAKAO_CLIENT_ID,
    KAKAO_CLIENT_SECRET: env.KAKAO_CLIENT_SECRET,
    NAVER_CLIENT_ID: env.NAVER_CLIENT_ID,
    NAVER_CLIENT_SECRET: env.NAVER_CLIENT_SECRET,
    DB: env.DB,
  };
}

export const { auth, signIn, signOut, handlers } = NextAuth(() => {
  const env = getEnv();
  const db = env.DB ? drizzle(env.DB) : undefined;

  return buildAuthConfig({
    db,
    schema,
    env: {
      AUTH_SECRET: env.AUTH_SECRET,
      KAKAO_CLIENT_ID: env.KAKAO_CLIENT_ID,
      KAKAO_CLIENT_SECRET: env.KAKAO_CLIENT_SECRET,
      NAVER_CLIENT_ID: env.NAVER_CLIENT_ID,
      NAVER_CLIENT_SECRET: env.NAVER_CLIENT_SECRET,
    },
  });
});
