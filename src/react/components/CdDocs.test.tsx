import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CdDocs } from './CdDocs';
import {
  closeDashboard,
  setDashboardLoaded,
  updateDashboard,
} from '../../admin/state/dashboard-store';

beforeEach(() => closeDashboard());
afterEach(() => cleanup());

describe('CdDocs', () => {
  it('초기 — 모든 박스 0', () => {
    const { container } = render(<CdDocs />);
    /* "0" 4번 등장 + 라벨들 */
    const text = container.textContent || '';
    expect(text).toContain('⏳ 대기');
    expect(text).toContain('✅ 승인');
    expect(text).toContain('❌ 반려');
    expect(text).toContain('📊 총');
    /* 0 이 최소 4번 — pending/approved/rejected/total */
    const zeros = text.match(/0/g) || [];
    expect(zeros.length).toBeGreaterThanOrEqual(4);
  });

  it('counts 모두 표시', () => {
    setDashboardLoaded({
      userId: 1,
      docCounts: { pending: 3, approved: 12, rejected: 1 },
    });
    const { container } = render(<CdDocs />);
    expect(container.textContent).toContain('⏳ 대기');
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('1');
    /* 총 = 16 */
    expect(container.textContent).toContain('16');
  });

  it('store 변경 → 자동 갱신', () => {
    const { container } = render(<CdDocs />);
    act(() => updateDashboard({ docCounts: { pending: 5 } }));
    expect(container.textContent).toContain('5');
  });

  it('counts undefined → 0 처리', () => {
    setDashboardLoaded({ userId: 1 });
    const { container } = render(<CdDocs />);
    /* 4개 박스 모두 0 */
    const text = container.textContent || '';
    expect(text.match(/0/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
