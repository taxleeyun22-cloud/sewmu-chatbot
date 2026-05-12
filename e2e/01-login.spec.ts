/**
 * Phase Next-Day29 (2026-05-12): Login 페이지 e2e.
 * 사장님 매일 진입 → form 검증 + zod 에러 + 잘못된 비번 거절.
 */
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('shadcn UI elements 모두 표시', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/관리자.*세무회계 이윤/);

    /* 브랜드 로고 + 헤더 */
    await expect(page.locator('text=세무회계 이윤').first()).toBeVisible();
    await expect(page.locator('text=대구 달서구').first()).toBeVisible();

    /* 사장님 비번 form */
    await expect(page.locator('input[type=password]')).toBeVisible();
    await expect(page.getByRole('button', { name: /진입/ })).toBeVisible();

    /* 카카오 OAuth 버튼 */
    await expect(page.getByRole('button', { name: /카카오/ })).toBeVisible();
  });

  test('빈 비번 zod 에러', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /진입/ }).click();
    await expect(page.locator('text=비밀번호를 입력하세요')).toBeVisible({ timeout: 2000 });
  });

  test('잘못된 비번 → 에러 표시', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type=password]').fill('wrong-key-12345');
    await page.getByRole('button', { name: /진입/ }).click();
    await expect(page.locator('text=비번이 일치하지 않습니다')).toBeVisible({ timeout: 3000 });
  });

  test('미인증 시 /admin/dashboard → /login redirect', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
