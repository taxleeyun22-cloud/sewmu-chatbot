/**
 * Phase Next-Day29 + Phase 10 cleanup (2026-05-12): Users page e2e.
 * 사장님 매일: 사용자 status 별 list + 박승호 검색 + dashboard 진입.
 *
 * 인증 fixture 필요 — `E2E_ADMIN_KEY` 환경변수.
 */
import { test, expect } from '@playwright/test';
import { setupAdminAuth, HAS_ADMIN_KEY } from './fixtures/auth';

test.describe('Users (/admin/users)', () => {
  test.skip(!HAS_ADMIN_KEY, 'E2E_ADMIN_KEY 미설정 — 실 인증 없이 의미 있는 검증 불가');

  test.beforeEach(async ({ page, context }) => {
    await setupAdminAuth(context);
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Status 탭 6개 + 헤더 표시', async ({ page }) => {
    await expect(page.locator('h1:has-text("사용자")').first()).toBeVisible({ timeout: 5000 });

    const tabs = ['대기', '기장거래처', '거절', '종료', '재가입', '관리자'];
    for (const tab of tabs) {
      await expect(page.locator(`[role="tab"]:has-text("${tab}")`).first()).toBeVisible({
        timeout: 3000,
      });
    }
  });

  test('검색 input 표시', async ({ page }) => {
    await expect(page.locator('input[placeholder*="이름"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('기장거래처 탭 클릭 → list 갱신', async ({ page }) => {
    await page.locator('[role="tab"]:has-text("기장거래처")').first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=/기장거래처.*사용자/').first()).toBeVisible({ timeout: 3000 });
  });

  test('approved_client 진입 → table 또는 EmptyState (둘 중 하나)', async ({ page }) => {
    await page.goto('/admin/users?status=approved_client');
    await page.waitForLoadState('networkidle');

    /* 사장님 prod 기장거래처 ≥ 1 → table 만 통과해야 정상 */
    const tableVisible = await page.locator('tbody tr').first().isVisible().catch(() => false);
    expect(tableVisible).toBeTruthy();
  });
});
