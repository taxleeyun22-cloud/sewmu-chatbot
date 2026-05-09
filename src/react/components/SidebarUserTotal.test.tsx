/**
 * Phase 2.2 (2026-05-08): SidebarUserTotal 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SidebarUserTotal } from './SidebarUserTotal';
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

describe('SidebarUserTotal', () => {
  it('초기값 0', () => {
    const { container } = render(<SidebarUserTotal />);
    expect(container.textContent).toBe('0');
  });

  it('userTotal=257 표시', () => {
    const { container } = render(<SidebarUserTotal />);
    act(() => updateSidebarCounts({ userTotal: 257 }));
    expect(container.textContent).toBe('257');
  });

  it('reset 후 0', () => {
    const { container } = render(<SidebarUserTotal />);
    act(() => updateSidebarCounts({ userTotal: 100 }));
    act(() => resetSidebarCounts());
    expect(container.textContent).toBe('0');
  });

  it('다른 컬럼 update — userTotal 영향 X', () => {
    const { container } = render(<SidebarUserTotal />);
    act(() => updateSidebarCounts({ userTotal: 50 }));
    act(() => updateSidebarCounts({ trash: 99, admin: 4 }));
    expect(container.textContent).toBe('50');
  });

  it('연속 update — 항상 최신값', () => {
    const { container } = render(<SidebarUserTotal />);
    act(() => updateSidebarCounts({ userTotal: 1 }));
    expect(container.textContent).toBe('1');
    act(() => updateSidebarCounts({ userTotal: 200 }));
    expect(container.textContent).toBe('200');
    act(() => updateSidebarCounts({ userTotal: 250 }));
    expect(container.textContent).toBe('250');
  });
});
