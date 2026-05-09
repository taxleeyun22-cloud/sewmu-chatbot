/**
 * Phase 3.4.A (2026-05-08): dashboard-store 단위 테스트.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  $dashboard,
  setDashboardLoading,
  setDashboardLoaded,
  setDashboardError,
  updateDashboard,
  closeDashboard,
  getDashboard,
  subscribeDashboard,
  initialDashboardState,
} from './dashboard-store';

beforeEach(() => {
  closeDashboard();
});

describe('dashboard-store', () => {
  it('초기 state — userId null / loading false', () => {
    expect(initialDashboardState.userId).toBeNull();
    expect(initialDashboardState.loading).toBe(false);
    expect(initialDashboardState.user).toBeNull();
    expect(initialDashboardState.mappedBusinesses).toEqual([]);
    expect(initialDashboardState.lastFetchedAt).toBeNull();
  });

  it('setDashboardLoading — userId set + loading true', () => {
    setDashboardLoading(64);
    const s = getDashboard();
    expect(s.userId).toBe(64);
    expect(s.loading).toBe(true);
    expect(s.user).toBeNull(); /* loading 초기에는 비어있음 */
  });

  it('setDashboardLoaded — 모든 컬럼 set + lastFetchedAt 갱신', () => {
    setDashboardLoading(64);
    setDashboardLoaded({
      userId: 64,
      user: { id: 64, real_name: '박승호', name: '박승호' },
      mappedBusinesses: [{ id: 2, company_name: '주식회사 온나플러스' } as never],
      docCounts: { pending: 1, approved: 5, rejected: 0 },
      priority: 2,
    });
    const s = getDashboard();
    expect(s.userId).toBe(64);
    expect(s.user?.real_name).toBe('박승호');
    expect(s.mappedBusinesses.length).toBe(1);
    expect(s.docCounts.approved).toBe(5);
    expect(s.priority).toBe(2);
    expect(s.loading).toBe(false);
    expect(s.lastFetchedAt).not.toBeNull();
  });

  it('setDashboardError — error msg + loading false', () => {
    setDashboardLoading(99);
    setDashboardError('서버 오류');
    expect(getDashboard().error).toBe('서버 오류');
    expect(getDashboard().loading).toBe(false);
  });

  it('updateDashboard — partial', () => {
    setDashboardLoading(64);
    updateDashboard({ priority: 1 });
    expect(getDashboard().priority).toBe(1);
    expect(getDashboard().userId).toBe(64); /* 다른 컬럼 유지 */
  });

  it('closeDashboard — 초기 state 복원', () => {
    setDashboardLoading(64);
    setDashboardLoaded({ userId: 64, user: { id: 64 } as never });
    closeDashboard();
    expect(getDashboard().userId).toBeNull();
    expect(getDashboard().user).toBeNull();
  });

  it('subscribeDashboard — 변경 알림', () => {
    let latest = getDashboard();
    const unsub = subscribeDashboard((s) => { latest = s; });
    setDashboardLoading(7);
    expect(latest.userId).toBe(7);
    unsub();
  });

  it('window.__dashboardStore global 노출', () => {
    expect(window.__dashboardStore).toBeDefined();
    expect(typeof window.__dashboardStore!.setLoading).toBe('function');
    expect(typeof window.__dashboardStore!.setLoaded).toBe('function');
    expect(typeof window.__dashboardStore!.close).toBe('function');
  });

  it('window.__dashboardStore.setLoaded — atom 갱신', () => {
    window.__dashboardStore!.setLoading(42);
    window.__dashboardStore!.setLoaded({
      userId: 42,
      user: { id: 42, real_name: '홍길동' } as never,
    });
    expect(getDashboard().userId).toBe(42);
    expect(getDashboard().user?.real_name).toBe('홍길동');
  });

  it('finance has_data — 기본 false', () => {
    expect(initialDashboardState.finance.has_data).toBe(false);
    setDashboardLoaded({
      userId: 1,
      finance: { has_data: true, rows: [{ period: '2024-1기', revenue: 1000000 }] },
    });
    expect(getDashboard().finance.has_data).toBe(true);
    expect(getDashboard().finance.rows.length).toBe(1);
  });
});
