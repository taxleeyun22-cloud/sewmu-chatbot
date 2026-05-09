/**
 * Phase 2.2 (2026-05-08): SidebarBizTotal 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SidebarBizTotal } from './SidebarBizTotal';
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

describe('SidebarBizTotal', () => {
  it('초기값 0', () => {
    const { container } = render(<SidebarBizTotal />);
    expect(container.textContent).toBe('0');
  });

  it('bizTotal=311 표시', () => {
    const { container } = render(<SidebarBizTotal />);
    act(() => updateSidebarCounts({ bizTotal: 311 }));
    expect(container.textContent).toBe('311');
  });

  it('reset 후 0', () => {
    const { container } = render(<SidebarBizTotal />);
    act(() => updateSidebarCounts({ bizTotal: 100 }));
    act(() => resetSidebarCounts());
    expect(container.textContent).toBe('0');
  });

  it('다른 컬럼 update — bizTotal 영향 X', () => {
    const { container } = render(<SidebarBizTotal />);
    act(() => updateSidebarCounts({ bizTotal: 75 }));
    act(() => updateSidebarCounts({ trash: 50, userTotal: 200 }));
    expect(container.textContent).toBe('75');
  });

  it('연속 update — 항상 최신값', () => {
    const { container } = render(<SidebarBizTotal />);
    act(() => updateSidebarCounts({ bizTotal: 5 }));
    expect(container.textContent).toBe('5');
    act(() => updateSidebarCounts({ bizTotal: 250 }));
    expect(container.textContent).toBe('250');
    act(() => updateSidebarCounts({ bizTotal: 311 }));
    expect(container.textContent).toBe('311');
  });
});
