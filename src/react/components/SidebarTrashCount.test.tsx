/**
 * Phase 2.1 (2026-05-08): SidebarTrashCount 단위 테스트.
 *
 * 검증:
 *   - 초기값 0
 *   - store update → 즉시 re-render
 *   - reset 후 0 복원
 *   - 여러 번 update — 항상 최신 값 표시
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { SidebarTrashCount } from './SidebarTrashCount';
import {
  resetSidebarCounts,
  updateSidebarCounts,
} from '../../admin/state/sidebar-store';

beforeEach(() => {
  resetSidebarCounts();
});

afterEach(() => {
  cleanup();
});

describe('SidebarTrashCount', () => {
  it('초기값 0 표시', () => {
    const { container } = render(<SidebarTrashCount />);
    expect(container.textContent).toBe('0');
  });

  it('store update → trash=5 표시', () => {
    render(<SidebarTrashCount />);
    act(() => {
      updateSidebarCounts({ trash: 5 });
    });
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('store update → trash=42 표시', () => {
    render(<SidebarTrashCount />);
    act(() => {
      updateSidebarCounts({ trash: 42 });
    });
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('reset 후 0 복원', () => {
    const { container } = render(<SidebarTrashCount />);
    act(() => {
      updateSidebarCounts({ trash: 10 });
    });
    expect(container.textContent).toBe('10');
    act(() => {
      resetSidebarCounts();
    });
    expect(container.textContent).toBe('0');
  });

  it('여러 update 연속 — 항상 최신값', () => {
    const { container } = render(<SidebarTrashCount />);
    act(() => updateSidebarCounts({ trash: 1 }));
    expect(container.textContent).toBe('1');
    act(() => updateSidebarCounts({ trash: 2 }));
    expect(container.textContent).toBe('2');
    act(() => updateSidebarCounts({ trash: 3 }));
    expect(container.textContent).toBe('3');
  });

  it('다른 컬럼 update 시 trash 영향 X', () => {
    const { container } = render(<SidebarTrashCount />);
    act(() => updateSidebarCounts({ trash: 7 }));
    act(() => updateSidebarCounts({ pending: 99, admin: 4 }));
    /* trash 는 그대로 7 (다른 컬럼 update 영향 X) */
    expect(container.textContent).toBe('7');
  });
});
