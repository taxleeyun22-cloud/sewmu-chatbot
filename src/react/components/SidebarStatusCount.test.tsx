/**
 * Phase 2.3 (2026-05-08): SidebarStatusCount 단위 테스트.
 * 7개 status 모두 정확히 store 컬럼 매핑 검증.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SidebarStatusCount } from './SidebarStatusCount';
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

describe('SidebarStatusCount', () => {
  it('초기값 0 (pending)', () => {
    const { container } = render(<SidebarStatusCount status="pending" />);
    expect(container.textContent).toBe('0');
  });

  it('pending 변경 → 즉시 갱신', () => {
    const { container } = render(<SidebarStatusCount status="pending" />);
    act(() => updateSidebarCounts({ pending: 5 }));
    expect(container.textContent).toBe('5');
  });

  it('approvedClient 변경 → 다른 status 영향 X', () => {
    const { container: pendingC } = render(<SidebarStatusCount status="pending" />);
    const { container: clientC } = render(<SidebarStatusCount status="approvedClient" />);
    act(() => updateSidebarCounts({ approvedClient: 253 }));
    expect(pendingC.textContent).toBe('0');
    expect(clientC.textContent).toBe('253');
  });

  it('admin status 표시', () => {
    const { container } = render(<SidebarStatusCount status="admin" />);
    act(() => updateSidebarCounts({ admin: 4 }));
    expect(container.textContent).toBe('4');
  });

  it('rejoined status 표시', () => {
    const { container } = render(<SidebarStatusCount status="rejoined" />);
    act(() => updateSidebarCounts({ rejoined: 2 }));
    expect(container.textContent).toBe('2');
  });

  it('rejected / terminated / approvedGuest 모두 정확', () => {
    const { container: rejC } = render(<SidebarStatusCount status="rejected" />);
    const { container: termC } = render(<SidebarStatusCount status="terminated" />);
    const { container: guestC } = render(<SidebarStatusCount status="approvedGuest" />);
    act(() => updateSidebarCounts({ rejected: 7, terminated: 3, approvedGuest: 1 }));
    expect(rejC.textContent).toBe('7');
    expect(termC.textContent).toBe('3');
    expect(guestC.textContent).toBe('1');
  });

  it('한 번에 모든 status update — 모든 컴포넌트 동기화', () => {
    const { container: p } = render(<SidebarStatusCount status="pending" />);
    const { container: c } = render(<SidebarStatusCount status="approvedClient" />);
    const { container: a } = render(<SidebarStatusCount status="admin" />);
    act(() => updateSidebarCounts({
      pending: 2, approvedClient: 253, approvedGuest: 1,
      rejected: 0, terminated: 0, rejoined: 0, admin: 4,
    }));
    expect(p.textContent).toBe('2');
    expect(c.textContent).toBe('253');
    expect(a.textContent).toBe('4');
  });

  it('reset 후 모든 컬럼 0', () => {
    const { container } = render(<SidebarStatusCount status="approvedClient" />);
    act(() => updateSidebarCounts({ approvedClient: 100 }));
    act(() => resetSidebarCounts());
    expect(container.textContent).toBe('0');
  });
});
