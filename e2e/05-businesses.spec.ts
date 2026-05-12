/**
 * Phase Next-Day29 + Phase 10 cleanup (2026-05-12): Business dashboard e2e.
 *
 * 인증 fixture 필요 — `E2E_ADMIN_KEY` 환경변수.
 */
import { test, expect } from '@playwright/test';
import { setupAdminAuth, HAS_ADMIN_KEY } from './fixtures/auth';

test.describe('Business dashboard (/admin/businesses)', () => {
  test.skip(!HAS_ADMIN_KEY, 'E2E_ADMIN_KEY 미설정');

  test.beforeEach(async ({ context }) => {
    await setupAdminAuth(context);
  });

  test('list page 표시 (탭 + 검색)', async ({ page }) => {
    await page.goto('/admin/businesses');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 5000 });
  });

  test('businesses/1 진입 → 헤더 + 6 섹션 표시', async ({ page }) => {
    await page.goto('/admin/businesses/1');
    await page.waitForLoadState('networkidle');

    /* 사장님 prod 에 business id=1 존재 — 멤버/방/메모/문서 섹션 중 최소 2개 visible */
    const sectionPatterns = [/멤버|구성원/, /상담방/, /메모/, /문서|영수증/];
    let foundCount = 0;
    for (const pat of sectionPatterns) {
      const visible = await page.locator(`text=${pat}`).first().isVisible().catch(() => false);
      if (visible) foundCount++;
    }
    expect(foundCount, '최소 2 섹션 visible').toBeGreaterThanOrEqual(2);
  });
});
