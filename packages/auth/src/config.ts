/**
 * Phase Next-Day5 (2026-05-09): Auth.js v5 config.
 *
 * 사용 (apps/customer-web/auth.ts):
 *   import { authConfig } from '@sewmu/auth/config';
 *   export const { auth, signIn, signOut, handlers } = NextAuth(authConfig);
 */
import type { NextAuthConfig } from 'next-auth';
import { kakaoProvider } from './providers/kakao';
import { naverProvider } from './providers/naver';

export function buildAuthConfig(env: {
  KAKAO_CLIENT_ID?: string;
  KAKAO_CLIENT_SECRET?: string;
  NAVER_CLIENT_ID?: string;
  NAVER_CLIENT_SECRET?: string;
}): NextAuthConfig {
  return {
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
      async session({ session, token }) {
        // Day 6: Drizzle adapter 통합 → users 테이블 의 is_admin / is_owner / staff_role 자동 inject
        if (session.user && token.userId) {
          (session.user as { id?: string }).id = String(token.userId);
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
