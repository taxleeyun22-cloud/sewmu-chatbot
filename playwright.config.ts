/**
 * Phase Next-Day29 + Phase 10 cleanup (2026-05-12): Playwright e2e config.
 *
 * 사장님 매일 워크플로 5 시나리오:
 *   1. login (사장님 비번)
 *   2. 옛 admin.html — 모달 inject + 가운데 정렬 + ESC
 *   3. dashboard — KPI 8 / 빠른 진입 / Recent 3섹션
 *   4. 사용자 list — status 탭 + 검색
 *   5. 업체 dashboard — 6 섹션
 *
 * 인증 분리 (Phase 10):
 * - 01-login / 02-old-admin: 인증 불필요 (chrome only)
 * - 03/04/05: `E2E_ADMIN_KEY` 환경변수 필요 → 실 HMAC cookie fixture
 *   (`e2e/fixtures/auth.ts`). 미설정 시 자동 skip (theatre 방지).
 *
 * 사용:
 *   npm run e2e                                  → prod, 인증 spec skip
 *   E2E_ADMIN_KEY=xxx npm run e2e                → prod, 모두 실행
 *   E2E_BASE_URL=http://localhost:3000 npm run e2e → 로컬 next dev
 *
 * 주의: 별도 webServer 안 띄움 — 사장님 prod (sewmu-admin.pages.dev) 가
 * single source of truth. 로컬 검증은 `apps/admin` 에서 `next dev` 후 BASE_URL 지정.
 */
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,           // 사장님 admin = 단일 user (병렬 X — auth fixture 1회만)
  retries: isCI ? 2 : 0,          // 로컬은 flaky 즉시 노출
  workers: 1,
  reporter: isCI
    ? [['list'], ['github']]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://sewmu-admin.pages.dev',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
