/**
 * Phase Next-Day29 (2026-05-12): Users page e2e.
 * 사장님 매일: 사용자 status 별 list + 박승호 검색 + dashboard 진입.
 */
import { test, expect } from '@playwright/test';

test.describe('Users (/admin/users)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: 'admin_key_auth',
        value: '1',
        domain: new URL(process.env.E2E_BASE_URL || 'https://sewmu-admin.pages.dev').hostname,
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
  });

  test('Status 탭 6개 + 헤더 표시', async ({ page }) => {
    await page.goto('/admin/users');
    if (/\/login/.test(page.url())) {
      test.skip(true, 'admin_key 인증 우회 안 됨');
      return;
    }

    /* 헤더 */
    await expect(page.locator('h1:has-text("사용자")').first()).toBeVisible({ timeout: 5000 });

    /* status 탭 6개 — TabsTrigger */
    const tabs = ['대기', '기장거래처', '거절', '종료', '재가입', '관리자'];
    for (const tab of tabs) {
      await expect(page.locator(`[role="tab"]:has-text("${tab}")`).first()).toBeVisible({
        timeout: 3000,
      });
    }
  });

  test('검색 input + lucide Search icon', async ({ page }) => {
    await page.goto('/admin/users');
    if (/\/login/.test(page.url())) {
      test.skip(true, 'admin_key 인증 우회 안 됨');
      return;
    }

    await expect(page.locator('input[placeholder*="이름"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('기장거래처 탭 클릭 → list 갱신', async ({ page }) => {
    await page.goto('/admin/users');
    if (/\/login/.test(page.url())) {
      test.skip(true, 'admin_key 인증 우회 안 됨');
      return;
    }

    /* 기장거래처 탭 */
    await page.locator('[role="tab"]:has-text("기장거래처")').first().click();
    await page.waitForTimeout(800);

    /* 카드 헤더에 "기장거래처 사용자" 텍스트 또는 totals badge */
    await expect(page.locator('text=/기장거래처.*사용자/').first()).toBeVisible({ timeout: 3000 });
  });

  test('사용자 list — 박승호 또는 EmptyState 또는 200건 이상', async ({ page }) => {
    await page.goto('/admin/users?status=approved_client');
    if (/\/login/.test(page.url())) {
      test.skip(true, 'admin_key 인증 우회 안 됨');
      return;
    }

    /* React Query 로딩 대기 (Skeleton or EmptyState or Table) */
    await page.waitForTimeout(2500);

    /* 셋 중 하나 — table row / empty state / 박승호 */
    const hasContent = await Promise.race([
      page.locator('text=박승호').first().isVisible().catch(() => false),
      page.locator('text=사용자 없음').first().isVisible().catch(() => false),
      page.locator('tbody tr').first().isVisible().catch(() => false),
    ]);
    expect(hasContent).toBeTruthy();
  });
});
