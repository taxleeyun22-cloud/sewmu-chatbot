/**
 * Phase 2.4 (2026-05-08): SidebarAlertCount 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SidebarAlertCount } from './SidebarAlertCount';
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

describe('SidebarAlertCount', () => {
  it('urgentTodos 초기값 0', () => {
    const { container } = render(<SidebarAlertCount variant="urgentTodos" />);
    expect(container.textContent).toBe('0');
  });

  it('urgentTodos 변경 → 즉시 갱신', () => {
    const { container } = render(<SidebarAlertCount variant="urgentTodos" />);
    act(() => updateSidebarCounts({ urgentTodos: 3 }));
    expect(container.textContent).toBe('3');
  });

  it('errorLog 변경 → 즉시 갱신', () => {
    const { container } = render(<SidebarAlertCount variant="errorLog" />);
    act(() => updateSidebarCounts({ errorLog: 7 }));
    expect(container.textContent).toBe('7');
  });

  it('errorLog redWhenNonZero=true + n=0 → 빨간 배지 X', () => {
    const { container } = render(<SidebarAlertCount variant="errorLog" redWhenNonZero />);
    expect(container.textContent).toBe('0');
    /* 빨간 배지 span 없음 — 일반 텍스트 노드 */
    expect(container.querySelector('span[style*="rgb(220, 38, 38)"]')).toBeNull();
  });

  it('errorLog redWhenNonZero=true + n=5 → 빨간 배지 SPAN', () => {
    const { container } = render(<SidebarAlertCount variant="errorLog" redWhenNonZero />);
    act(() => updateSidebarCounts({ errorLog: 5 }));
    expect(container.textContent).toBe('5');
    /* 빨간 배지 span 존재 — jsdom 은 #dc2626 그대로 반환 (브라우저는 rgb(220,38,38) 변환) */
    const redSpan = container.querySelector('span');
    expect(redSpan).not.toBeNull();
    const bg = redSpan?.style.background || '';
    expect(/dc2626|rgb\(220,\s*38,\s*38\)/i.test(bg)).toBe(true);
  });

  it('reset 후 두 variant 모두 0', () => {
    const { container: t } = render(<SidebarAlertCount variant="urgentTodos" />);
    const { container: e } = render(<SidebarAlertCount variant="errorLog" />);
    act(() => updateSidebarCounts({ urgentTodos: 5, errorLog: 3 }));
    act(() => resetSidebarCounts());
    expect(t.textContent).toBe('0');
    expect(e.textContent).toBe('0');
  });

  it('다른 컬럼 update — variant 영향 X', () => {
    const { container } = render(<SidebarAlertCount variant="urgentTodos" />);
    act(() => updateSidebarCounts({ urgentTodos: 9 }));
    act(() => updateSidebarCounts({ trash: 100, admin: 4 }));
    expect(container.textContent).toBe('9');
  });
});
