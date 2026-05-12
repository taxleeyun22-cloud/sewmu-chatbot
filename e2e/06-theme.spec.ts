/**
 * Phase 14 (2026-05-12): Theme toggle e2e — chrome only (auth 불필요).
 *
 * /login 페이지 진입 시 (Sidebar 없음) 또는 admin 진입 시 (Sidebar 있음).
 * 새로 시작 — login 페이지 자체에는 theme toggle 안 보임 (Sidebar 안 됨).
 * 그래서 localStorage 변경 → 다음 로드 시 다크 적용되는지만 검증.
 */
import { test, expect } from '@playwright/test';

test.describe('Dark mode (FOUC + persistence)', () => {
  test('localStorage theme=dark → 첫 paint 부터 html.dark 적용', async ({ page, context }) => {
    /* navigate 전에 localStorage init */
    await page.goto('/login');

    /* localStorage 변경 후 reload — FOUC 방지 inline script 가 paint 전 적용해야 */
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload();

    /* html.dark 클래스 즉시 적용 (script tag inline 으로 paint 전 실행) */
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(isDark).toBe(true);
  });

  test('localStorage theme=light → html.dark 없음', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.reload();
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(isDark).toBe(false);
  });

  test('localStorage 미설정 시 prefers-color-scheme 따름', async ({ browser }) => {
    /* dark scheme emulation */
    const darkCtx = await browser.newContext({ colorScheme: 'dark' });
    const page = await darkCtx.newPage();
    /* fresh storage */
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('theme'));
    await page.reload();
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(isDark).toBe(true);
    await darkCtx.close();
  });
});
