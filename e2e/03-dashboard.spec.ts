/**
 * Phase Next-Day29 (2026-05-12): Dashboard e2e.
 * 사장님 매일 진입 화면 — KPI 8개 + 빠른 진입 5개 + Recent 3섹션.
 *
 * 인증 fixture 가 없으면 (`E2E_ADMIN_KEY` 미설정) — middleware redirect 로 인해
 * /admin/* 진입 자체가 안 되므로 전체 fixme. 가짜 cookie `admin_key_auth=1`
 * 만으로는 tRPC HMAC 검증을 통과 못 함 (Phase 10 cleanup 2026-05-12).
 *
 * 사용:
 *   E2E_ADMIN_KEY=실제키 npm run e2e
 */
import { test, expect } from '@playwright/test';
import { setupAdminAuth, HAS_ADMIN_KEY } from './fixtures/auth';

test.describe('Dashboard (/admin/dashboard)', () => {
  test.skip(!HAS_ADMIN_KEY, 'E2E_ADMIN_KEY 미설정 — 실 인증 없이 의미 있는 검증 불가');

  test.beforeEach(async ({ page, context }) => {
    await setupAdminAuth(context);
    await page.goto('/admin/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('KPI 8개 카드 + 헤더 표시', async ({ page }) => {
    await expect(page.getByText('대시보드')).toBeVisible({ timeout: 5000 });

    const kpiLabels = [
      '대기 거래처',
      '기장거래처',
      '활성 상담방',
      '임박 일정',
      '미처리 영수증',
      '검증 대기',
      '진행 신고',
      '에러 로그',
    ];
    for (const lb of kpiLabels) {
      await expect(page.locator(`text=${lb}`).first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('빠른 진입 5개 (검색/메모/단체발송/신고/FAQ) 표시', async ({ page }) => {
    await expect(page.locator('text=빠른 진입').first()).toBeVisible({ timeout: 5000 });

    const labels = ['전역 검색', '메모', '단체발송', '신고 검토표', 'FAQ'];
    for (const lb of labels) {
      await expect(page.locator(`a:has-text("${lb}")`).first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('Recent 3섹션 (대화/업로드/메모) 표시', async ({ page }) => {
    await expect(page.locator('text=최근 대화').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=최근 업로드').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=최근 메모').first()).toBeVisible({ timeout: 5000 });
  });

  test('실시간 Badge (animate-pulse) 표시', async ({ page }) => {
    const liveBadge = page.locator('text=실시간').first();
    await expect(liveBadge).toBeVisible({ timeout: 5000 });
    const cls = await liveBadge.getAttribute('class');
    expect(cls).toContain('animate-pulse');
  });

  test('KPI 숫자가 실제로 fetch 됨 (Skeleton 사라짐)', async ({ page }) => {
    /* 진짜 데이터 검증 — auth fixture 가 있어야만 통과 */
    await page.waitForLoadState('networkidle');
    /* Skeleton (h-5 w-8) 이 모두 사라졌는지 — 데이터 로드 완료 신호 */
    const skeletons = page.locator('[class*="animate-pulse"][class*="h-5"]');
    await expect(skeletons).toHaveCount(0, { timeout: 8000 });
  });
});
