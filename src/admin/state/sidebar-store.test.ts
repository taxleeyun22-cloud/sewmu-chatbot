/**
 * Phase A (2026-05-08): sidebar-store 단위 테스트.
 *
 * 검증:
 *   - 초기값 정확
 *   - update partial 적용
 *   - reset 후 초기값 복원
 *   - subscribe → 변경 알림
 *   - window.__sidebarStore global 노출
 *   - lastUpdatedAt 자동 갱신
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  $sidebarCounts,
  updateSidebarCounts,
  resetSidebarCounts,
  getSidebarCounts,
  subscribeSidebarCounts,
  initialSidebarCounts,
} from './sidebar-store';

describe('sidebar-store', () => {
  beforeEach(() => {
    resetSidebarCounts();
  });

  it('initialSidebarCounts 모든 컬럼 0 / lastUpdatedAt null', () => {
    expect(initialSidebarCounts.userTotal).toBe(0);
    expect(initialSidebarCounts.bizTotal).toBe(0);
    expect(initialSidebarCounts.trash).toBe(0);
    expect(initialSidebarCounts.urgentTodos).toBe(0);
    expect(initialSidebarCounts.errorLog).toBe(0);
    expect(initialSidebarCounts.pending).toBe(0);
    expect(initialSidebarCounts.admin).toBe(0);
    expect(initialSidebarCounts.lastUpdatedAt).toBeNull();
  });

  it('reset 후 atom 도 초기값', () => {
    expect(getSidebarCounts().userTotal).toBe(0);
    expect(getSidebarCounts().lastUpdatedAt).toBeNull();
  });

  it('updateSidebarCounts partial 적용', () => {
    updateSidebarCounts({ pending: 5, admin: 4 });
    const c = getSidebarCounts();
    expect(c.pending).toBe(5);
    expect(c.admin).toBe(4);
    /* 나머지는 그대로 */
    expect(c.userTotal).toBe(0);
    expect(c.bizTotal).toBe(0);
  });

  it('updateSidebarCounts 후 lastUpdatedAt 갱신', () => {
    const before = Date.now();
    updateSidebarCounts({ pending: 1 });
    const c = getSidebarCounts();
    expect(c.lastUpdatedAt).not.toBeNull();
    expect(c.lastUpdatedAt!).toBeGreaterThanOrEqual(before);
  });

  it('reset 시 모든 값 초기화', () => {
    updateSidebarCounts({ pending: 10, admin: 5 });
    resetSidebarCounts();
    const c = getSidebarCounts();
    expect(c.pending).toBe(0);
    expect(c.admin).toBe(0);
    expect(c.lastUpdatedAt).toBeNull();
  });

  it('subscribeSidebarCounts 변경 알림', () => {
    let latest = getSidebarCounts();
    const unsubscribe = subscribeSidebarCounts((c) => {
      latest = c;
    });
    updateSidebarCounts({ trash: 7 });
    expect(latest.trash).toBe(7);
    unsubscribe();
  });

  it('subscribeSidebarCounts unsubscribe 후 알림 X', () => {
    let count = 0;
    const unsubscribe = subscribeSidebarCounts(() => {
      count++;
    });
    updateSidebarCounts({ pending: 1 });
    unsubscribe();
    updateSidebarCounts({ pending: 2 });
    /* unsubscribe 후 호출은 1번 (subscribe 시 즉시 + update 1번) */
    expect(count).toBeGreaterThanOrEqual(1);
    /* update 2번째는 cb 호출 X — count 가 unsubscribe 전 값 그대로 */
    const before = count;
    updateSidebarCounts({ pending: 3 });
    expect(count).toBe(before);
  });

  it('window.__sidebarStore global 노출', () => {
    expect(typeof window).toBe('object');
    expect(window.__sidebarStore).toBeDefined();
    expect(typeof window.__sidebarStore!.update).toBe('function');
    expect(typeof window.__sidebarStore!.get).toBe('function');
    expect(typeof window.__sidebarStore!.reset).toBe('function');
    expect(typeof window.__sidebarStore!.subscribe).toBe('function');
  });

  it('window.__sidebarStore.update 호출 시 atom 갱신', () => {
    window.__sidebarStore!.update({ admin: 99 });
    expect(getSidebarCounts().admin).toBe(99);
  });

  it('window.__sidebarStore.get 호출 시 현재 값 반환', () => {
    updateSidebarCounts({ trash: 42 });
    const c = window.__sidebarStore!.get();
    expect(c.trash).toBe(42);
  });

  it('대시보드 카운트 종합 시나리오', () => {
    /* admin.js refreshSidebarCounts 패턴 시뮬레이션 */
    window.__sidebarStore!.update({
      pending: 2,
      approvedClient: 253,
      approvedGuest: 1,
      admin: 4,
      userTotal: 260,
      bizTotal: 311,
    });
    const c = getSidebarCounts();
    expect(c.pending).toBe(2);
    expect(c.approvedClient).toBe(253);
    expect(c.userTotal).toBe(260);
    expect(c.bizTotal).toBe(311);
    expect(c.admin).toBe(4);
  });
});
