/**
 * Phase Next-1.3 (2026-05-09): apps/customer-web — 거래처 챗봇 (Next.js 15).
 *
 * Cloudflare Pages 배포: @cloudflare/next-on-pages 사용.
 * 기존 chat.js / 카카오 OAuth / R2 업로드 모두 점진 마이그레이션.
 */
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages 호환
  experimental: {
    // edge runtime 사용 (Cloudflare Workers 호환)
  },
  // build 시 sentry release tracking
  env: {
    NEXT_PUBLIC_RELEASE: process.env.CF_PAGES_COMMIT_SHA || 'dev',
  },
};

export default nextConfig;
