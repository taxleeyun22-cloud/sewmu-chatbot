/**
 * Phase Next-Day15 (2026-05-09): Auth.js v5 config + Drizzle D1 adapter.
 *
 * 사장님 명령 (Day 15): 실제 카카오 로그인 작동.
 *
 * 사용 (apps/customer-web/auth.ts):
 *   import { buildAuthConfig } from '@sewmu/auth';
 *   import { drizzle, schema } from '@sewmu/db/client';
 *   const config = buildAuthConfig({ db: drizzle(env.DB), schema, env });
 *   export const { auth, signIn, signOut, handlers } = NextAuth(config);
 */
import type { NextAuthConfig } from 'next-auth';
import { kakaoProvider } from './providers/kakao';
import { naverProvider } from './providers/naver';
import { DrizzleD1Adapter } from './drizzle-adapter';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BuildAuthConfigOptions {
  /** Drizzle client (drizzle(env.DB)) — adapter 옵션. 없으면 JWT-only mode. */
  db?: any;
  /** @sewmu/db schema export — adapter 옵션. */
  schema?: any;
  env: {
    KAKAO_CLIENT_ID?: string;
    KAKAO_CLIENT_SECRET?: string;
    NAVER_CLIENT_ID?: string;
    NAVER_CLIENT_SECRET?: string;
    AUTH_SECRET?: string;
  };
}

export function buildAuthConfig(options: BuildAuthConfigOptions): NextAuthConfig {
  const { db, schema, env } = options;

  return {
    secret: env.AUTH_SECRET,
    session: { strategy: db && schema ? 'database' : 'jwt' },
    adapter: db && schema ? DrizzleD1Adapter(db, schema) : undefined,
    providers: [
      // 카카오 (거래처 1순위)
      {
        ...kakaoProvider,
        clientId: env.KAKAO_CLIENT_ID,
        clientSecret: env.KAKAO_CLIENT_SECRET,
      } as never,
      // 네이버 (대안)
      {
        ...naverProvider,
        clientId: env.NAVER_CLIENT_ID,
        clientSecret: env.NAVER_CLIENT_SECRET,
      } as never,
    ],
    callbacks: {
      async session({ session, token, user }) {
        const id = (user as { id?: string } | undefined)?.id ?? token?.userId;
        if (session.user && id) {
          (session.user as { id?: string }).id = String(id);
        }
        return session;
      },
      async jwt({ token, user }) {
        if (user && (user as { id?: string }).id) {
          token.userId = (user as { id: string }).id;
        }
        return token;
      },
    },
    pages: {
      signIn: '/login',
    },
  };
}

/** Backward compat (Day 5 시그니처). */
export function buildAuthConfigSimple(env: BuildAuthConfigOptions['env']): NextAuthConfig {
  return buildAuthConfig({ env });
}
