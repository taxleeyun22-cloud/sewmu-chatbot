/**
 * Phase Next-Day29 (2026-05-12): Playwright e2e config — 사장님 명령 "구글 수준".
 *
 * 사장님 매일 워크플로 5 시나리오 자동 검증:
 *   1. login (사장님 비번)
 *   2. dashboard 진입 + KPI 표시
 *   3. 사용자 list (status 별) + 박승호 검색
 *   4. 거래처 dashboard (9 카드)
 *   5. 옛 admin.html 진입 + 모달 가운데 정렬 + ESC 닫기
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,           // 사장님 admin = 단일 user (병렬 X)
  retries: 1,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
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
