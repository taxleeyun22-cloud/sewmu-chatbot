import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CdRecentChat } from './CdRecentChat';
import {
  closeDashboard,
  setDashboardLoading,
  setDashboardLoaded,
} from '../../admin/state/dashboard-store';

beforeEach(() => closeDashboard());
afterEach(() => cleanup());

describe('CdRecentChat', () => {
  it('초기 — 빈 표시', () => {
    const { container } = render(<CdRecentChat />);
    expect(container.textContent).toBe('');
  });

  it('loading=true → "…"', () => {
    setDashboardLoading(64);
    const { container } = render(<CdRecentChat />);
    expect(container.textContent).toBe('…');
  });

  it('userId 있고 room 없으면 → "활성 상담방 없음"', () => {
    setDashboardLoaded({ userId: 64, user: { id: 64 }, recentRoom: null });
    const { container } = render(<CdRecentChat />);
    expect(container.textContent).toContain('활성 상담방 없음');
  });

  it('room 있으면 안내 + 방 정보', () => {
    setDashboardLoaded({
      userId: 64,
      user: { id: 64 },
      recentRoom: { id: 'ABC123', name: '갑의 방', status: 'active' },
    });
    const { container } = render(<CdRecentChat />);
    expect(container.textContent).toContain('상담방 열기');
    expect(container.textContent).toContain('#ABC123');
    expect(container.textContent).toContain('갑의 방');
  });

  it('room 있고 name 없으면 id 만', () => {
    setDashboardLoaded({
      userId: 64,
      user: { id: 64 },
      recentRoom: { id: 'XYZ', name: null },
    });
    const { container } = render(<CdRecentChat />);
    expect(container.textContent).toContain('#XYZ');
  });

  it('store 변경 → 자동 갱신', () => {
    const { container } = render(<CdRecentChat />);
    act(() => setDashboardLoaded({ userId: 1, user: { id: 1 }, recentRoom: null }));
    expect(container.textContent).toContain('활성 상담방 없음');
    act(() =>
      setDashboardLoaded({
        userId: 1,
        user: { id: 1 },
        recentRoom: { id: 'NEW', name: '새 방' },
      }),
    );
    expect(container.textContent).toContain('새 방');
  });
});
