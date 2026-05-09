/**
 * Phase 3.4.C (2026-05-08): CdBasic 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { CdBasic } from './CdBasic';
import {
  closeDashboard,
  setDashboardLoading,
  setDashboardLoaded,
  setDashboardError,
} from '../../admin/state/dashboard-store';

beforeEach(() => {
  closeDashboard();
});

afterEach(() => {
  cleanup();
  delete window.openEditUserInfoModal;
});

describe('CdBasic', () => {
  it('초기 — loading false, user 없음 → 미등록 표시', () => {
    const { container } = render(<CdBasic />);
    expect(container.textContent).toContain('이름:');
    expect(container.textContent).toContain('연락처: 미등록');
    expect(container.textContent).toContain('생년월일: 미등록');
  });

  it('loading=true → "…"', () => {
    setDashboardLoading(64);
    const { container } = render(<CdBasic />);
    expect(container.textContent).toBe('…');
  });

  it('error → 오류 메시지', () => {
    setDashboardError('서버 다운');
    const { container } = render(<CdBasic />);
    expect(container.textContent).toContain('로드 실패: 서버 다운');
  });

  it('user 정보 로드 후 모든 컬럼 표시', () => {
    setDashboardLoaded({
      userId: 64,
      user: {
        id: 64,
        real_name: '박승호',
        name: '박승호',
        phone: '010-1234-5678',
        birth_date: '1980-01-15',
        email: 'park@example.com',
        created_at: '2024-03-15 10:30:00',
      },
    });
    const { container } = render(<CdBasic />);
    expect(container.textContent).toContain('박승호');
    expect(container.textContent).toContain('010-1234-5678');
    expect(container.textContent).toContain('1980-01-15');
    expect(container.textContent).toContain('park@example.com');
    expect(container.textContent).toContain('2024-03-15');
  });

  it('email 없으면 그 줄 표시 X', () => {
    setDashboardLoaded({
      userId: 64,
      user: { id: 64, real_name: '홍길동', email: null },
    });
    const { container } = render(<CdBasic />);
    expect(container.textContent).not.toContain('이메일:');
  });

  it('real_name 없으면 name 표시', () => {
    setDashboardLoaded({
      userId: 64,
      user: { id: 64, real_name: null, name: '카톡닉네임' },
    });
    const { container } = render(<CdBasic />);
    expect(container.textContent).toContain('카톡닉네임');
  });

  it('user 없으면 #userId fallback', () => {
    setDashboardLoaded({ userId: 99 });
    const { container } = render(<CdBasic />);
    expect(container.textContent).toContain('#99');
  });

  it('수정 버튼 클릭 → openEditUserInfoModal 호출', () => {
    const mockOpen = vi.fn();
    window.openEditUserInfoModal = mockOpen;
    setDashboardLoaded({
      userId: 64,
      user: { id: 64, real_name: '박승호' },
    });
    const { container } = render(<CdBasic />);
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(mockOpen).toHaveBeenCalledWith(64);
  });

  it('store 변경 → 자동 갱신', () => {
    setDashboardLoaded({
      userId: 1,
      user: { id: 1, real_name: '첫번째', phone: '010-1' },
    });
    const { container } = render(<CdBasic />);
    expect(container.textContent).toContain('첫번째');
    expect(container.textContent).toContain('010-1');
    act(() => {
      setDashboardLoaded({
        userId: 2,
        user: { id: 2, real_name: '두번째', phone: '010-2' },
      });
    });
    expect(container.textContent).toContain('두번째');
    expect(container.textContent).toContain('010-2');
    expect(container.textContent).not.toContain('첫번째');
  });

  it('birth_date 없으면 "미등록"', () => {
    setDashboardLoaded({
      userId: 1,
      user: { id: 1, real_name: '박승호', birth_date: null },
    });
    const { container } = render(<CdBasic />);
    expect(container.textContent).toContain('생년월일: 미등록');
  });

  it('phone 없으면 "미등록"', () => {
    setDashboardLoaded({
      userId: 1,
      user: { id: 1, real_name: '박승호', phone: null },
    });
    const { container } = render(<CdBasic />);
    expect(container.textContent).toContain('연락처: 미등록');
  });
});
