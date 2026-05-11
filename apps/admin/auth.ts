/**
 * Phase Next-Day27 (2026-05-11): Auth.js v5 — apps/admin 진입점.
 *
 * 거래처 사이트 (apps/customer-web) 와 같은 코드 패턴, 다른 AUTH_URL.
 * 같은 D1 DB 공유 — 사장님 카톡 = 양쪽에서 같은 user_id.
 */
import NextAuth from 'next-auth';
import { buildAuthConfig } from '@sewmu/auth';
import { drizzle } from '@sewmu/db/client';
import * as schema from '@sewmu/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

function getEnv() {
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
