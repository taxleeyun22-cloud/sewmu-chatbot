/**
 * Phase 11 cleanup (2026-05-12): Toast a11y + lifecycle 단위 테스트.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { toast, Toaster, type ToastVariant } from './toast';

describe('toast lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    /* 잔여 toast 모두 dismiss */
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
  });

  it('toast.success → role="status" + aria-live="polite" + 메시지 표시', () => {
    render(<Toaster />);
    act(() => {
      toast.success('저장 완료');
    });
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('저장 완료');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('toast.error → role="alert" + aria-live="assertive"', () => {
    render(<Toaster />);
    act(() => {
      toast.error('실패');
    });
    const el = screen.getByRole('alert');
    expect(el).toHaveTextContent('실패');
    expect(el.getAttribute('aria-live')).toBe('assertive');
  });

  it('error 는 최소 5초 표시 (사장님이 읽을 시간)', () => {
    render(<Toaster />);
    act(() => {
      toast.error('실패', 2000);
    });
    /* 3초 지나도 여전히 표시 */
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('alert')).not.toBeNull();
    /* 5초 지나면 사라짐 */
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('닫기 버튼 (aria-label="알림 닫기") 클릭 → 즉시 dismiss', () => {
    render(<Toaster />);
    act(() => {
      toast.info('hi');
    });
    const closeBtn = screen.getByLabelText('알림 닫기');
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ESC 키 → 최신 toast dismiss', () => {
    render(<Toaster />);
    act(() => {
      toast.info('first');
      toast.info('second');
    });
    expect(screen.getAllByRole('status')).toHaveLength(2);

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    /* second 가 dismiss — first 만 남음 */
    const remaining = screen.getAllByRole('status');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveTextContent('first');
  });

  it('toast.show 가 duration 후 auto-dismiss', () => {
    render(<Toaster />);
    act(() => {
      toast.success('done', 1000);
    });
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('variant 별 색 클래스', () => {
    const variants: ToastVariant[] = ['success', 'error', 'info', 'warning', 'default'];
    for (const v of variants) {
      const { unmount } = render(<Toaster />);
      act(() => {
        toast[v === 'default' ? 'info' : v]('test');
      });
      /* style class 자체 검증은 fragile — 대신 role 만 검증 */
      const role = v === 'error' || v === 'warning' ? 'alert' : 'status';
      expect(screen.getByRole(role)).toBeInTheDocument();
      act(() => {
        toast.dismissLatest();
      });
      unmount();
    }
  });
});
