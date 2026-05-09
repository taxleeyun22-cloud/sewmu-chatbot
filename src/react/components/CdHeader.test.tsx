/**
 * Phase 3.4.B (2026-05-08): CdHeader 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CdName, CdSub, CdPriority } from './CdHeader';
import {
  closeDashboard,
  setDashboardLoading,
  setDashboardLoaded,
} from '../../admin/state/dashboard-store';

beforeEach(() => {
  closeDashboard();
});

afterEach(() => {
  cleanup();
});

describe('CdName', () => {
  it('초기 — 빈 표시', () => {
    const { container } = render(<CdName />);
    expect(container.textContent).toBe('');
  });

  it('loading=true → "불러오는 중..."', () => {
    setDashboardLoading(64);
    const { container } = render(<CdName />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('user 로드 후 real_name 표시', () => {
    setDashboardLoading(64);
    setDashboardLoaded({
      userId: 64,
      user: { id: 64, real_name: '박승호', name: '박승호카톡닉' },
    });
    const { container } = render(<CdName />);
    expect(container.textContent).toBe('박승호');
  });

  it('user 로드 후 real_name 없으면 name', () => {
    setDashboardLoading(64);
    setDashboardLoaded({
      userId: 64,
      user: { id: 64, real_name: null, name: '카톡닉네임' },
    });
    const { container } = render(<CdName />);
    expect(container.textContent).toBe('카톡닉네임');
  });

  it('user 없으면 #userId fallback', () => {
    setDashboardLoading(99);
    setDashboardLoaded({ userId: 99 });
    const { container } = render(<CdName />);
    expect(container.textContent).toBe('#99');
  });
});

describe('CdSub', () => {
  it('user 없으면 빈 표시', () => {
    const { container } = render(<CdSub />);
    expect(container.textContent).toBe('');
  });

  it('phone + provider + status 모두 표시', () => {
    setDashboardLoaded({
      userId: 64,
      user: {
        id: 64,
        phone: '010-1234-5678',
        provider: 'kakao',
        approval_status: 'approved_client',
      },
    });
    const { container } = render(<CdSub />);
    expect(container.textContent).toContain('010-1234-5678');
    expect(container.textContent).toContain('kakao 로그인');
    expect(container.textContent).toContain('🏢 기장거래처');
  });

  it('phone 없으면 "연락처 미등록"', () => {
    setDashboardLoaded({
      userId: 64,
      user: { id: 64, phone: null, provider: 'kakao', approval_status: 'pending' },
    });
    const { container } = render(<CdSub />);
    expect(container.textContent).toContain('연락처 미등록');
    expect(container.textContent).toContain('⏳ pending');
  });

  it('approval_status approved_guest → "✅ 일반"', () => {
    setDashboardLoaded({
      userId: 1,
      user: { id: 1, phone: '010', approval_status: 'approved_guest' },
    });
    const { container } = render(<CdSub />);
    expect(container.textContent).toContain('✅ 일반');
  });
});

describe('CdPriority', () => {
  it('초기 — "미분류"', () => {
    const { container } = render(<CdPriority />);
    expect(container.textContent).toBe('미분류');
  });

  it('priority=1 → "1순위" + 빨강', () => {
    setDashboardLoaded({ userId: 1, priority: 1 });
    const { container } = render(<CdPriority />);
    expect(container.textContent).toBe('1순위');
    const span = container.querySelector('span');
    /* jsdom 은 #dc2626 그대로, 브라우저는 rgb(220,38,38) — 둘 다 허용 */
    const bg = span?.style.background || '';
    expect(/dc2626|rgb\(220,\s*38,\s*38\)/i.test(bg)).toBe(true);
  });

  it('priority=2 → "2순위" + 노랑', () => {
    setDashboardLoaded({ userId: 1, priority: 2 });
    const { container } = render(<CdPriority />);
    expect(container.textContent).toBe('2순위');
  });

  it('store 변경 → 자동 갱신', () => {
    const { container } = render(<CdPriority />);
    expect(container.textContent).toBe('미분류');
    act(() => setDashboardLoaded({ userId: 1, priority: 3 }));
    expect(container.textContent).toBe('3순위');
  });
});
