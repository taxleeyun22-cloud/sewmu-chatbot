import type { NextConfig } from 'next';

/**
 * Phase 12 (2026-05-12): Google-grade 보안 헤더 + CSP.
 *
 * - X-Frame-Options DENY — clickjacking 차단 (옛 admin iframe 패턴 폐지)
 * - X-Content-Type-Options nosniff — MIME confusion 차단
 * - Referrer-Policy same-origin — URL 안 ADMIN_KEY 외부 유출 차단
 * - Permissions-Policy — 불필요 권한 차단 (geolocation/camera/microphone 등)
 * - Content-Security-Policy — script-src 'self' + Tailwind 'unsafe-inline'
 *   (인라인 style 어쩔 수 없음). new admin (/admin/*) 에만 strict.
 * - Strict-Transport-Security — HSTS preload 대상 (Cloudflare 이미 HTTPS 강제,
 *   브라우저에 명시)
 *
 * 주의: CSP 가 너무 빡빡하면 옛 admin.html (raw <script> 인라인) 깨짐.
 * `/admin.html` path 는 SECURITY_HEADERS 만 적용 (CSP 추가 X).
 * `/admin/*` (새 Next 페이지) 만 strict CSP.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(), camera=(), microphone=(), payment=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

/* CSP — new admin 용. Tailwind / shadcn dynamic style → 'unsafe-inline' 불가피.
 * Sentry 도입 시 connect-src 에 *.sentry.io 추가 (이미 포함). */
const CSP_NEW_ADMIN = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js inline + React dev
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.sentry.io https://api.openai.com https://*.cloudflareinsights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_RELEASE: process.env.CF_PAGES_COMMIT_SHA || 'dev',
  },
  /* Phase 12: 보안 헤더 전역. /admin/* (새 Next 페이지) 만 CSP 추가. */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
      {
        source: '/admin/:path*',
        headers: [
          ...SECURITY_HEADERS,
          { key: 'Content-Security-Policy', value: CSP_NEW_ADMIN },
        ],
      },
    ];
  },
};

export default nextConfig;
