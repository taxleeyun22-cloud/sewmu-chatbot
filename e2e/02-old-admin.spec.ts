/**
 * Phase Next-Day29 (2026-05-12): 옛 admin.html e2e — 모달 25개 + ESC + backdrop 닫기.
 * 사장님 명령 "팝업 위치 + ESC 카톡 UX".
 */
import { test, expect } from '@playwright/test';

test.describe('옛 admin.html (legacy)', () => {
  test('정적 자산 + 모달 inject', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page).toHaveTitle(/관리자.*세무회계 이윤/);

    /* 카톡 로그인 버튼 (사장님 명령 2026-05-12) */
    await expect(page.getByRole('button', { name: /카카오 계정으로 로그인/ })).toBeVisible();

    /* admin-modals.html inject 대기 */
    await page.waitForTimeout(2500);

    /* 모달 inject 됐는지 (createRoomModal 존재) */
    const modalExists = await page.locator('#createRoomModal').count();
    expect(modalExists).toBeGreaterThan(0);
  });

  test('5 모달 모두 viewport 가운데 정렬', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(2500);

    /* mainAppView 강제 표시 (비로그인 상태 시뮬레이션) */
    await page.evaluate(() => {
      const m = document.getElementById('mainAppView');
      if (m) {
        m.classList.remove('hidden');
        (m as HTMLElement).style.display = 'flex';
      }
    });

    const results = await page.evaluate(() => {
      const ids = ['createRoomModal', 'memoModal', 'searchModal', 'bulkSendModal', 'manualClientModal'];
      const out: Record<string, { centered: boolean; w: number }> = {};
      const vw = window.innerWidth;
      for (const id of ids) {
        const m = document.getElementById(id);
        if (!m) continue;
        (m as HTMLElement).style.display = 'flex';
        const child = m.children[0];
        const cr = child?.getBoundingClientRect();
        if (!cr) continue;
        out[id] = {
          centered: Math.abs(cr.x + cr.width / 2 - vw / 2) < 30,
          w: Math.round(cr.width),
        };
        (m as HTMLElement).style.display = 'none';
      }
      return out;
    });

    for (const [id, info] of Object.entries(results)) {
      expect(info.centered, `${id} viewport 가운데 정렬`).toBe(true);
      expect(info.w, `${id} width > 0`).toBeGreaterThan(0);
    }
  });

  test('ESC 키 → 모달 자동 닫힘', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(2500);

    /* 모달 강제 열기 */
    await page.evaluate(() => {
      const m = document.getElementById('createRoomModal');
      if (m) (m as HTMLElement).style.display = 'flex';
    });

    const beforeEsc = await page.evaluate(() => {
      const m = document.getElementById('createRoomModal');
      return (m as HTMLElement)?.style.display;
    });
    expect(beforeEsc).toBe('flex');

    /* ESC 키 */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const afterEsc = await page.evaluate(() => {
      const m = document.getElementById('createRoomModal');
      return (m as HTMLElement)?.style.display;
    });
    expect(afterEsc).toBe('none');
  });
});
