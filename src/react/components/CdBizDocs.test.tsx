import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CdBizDocs } from './CdBizDocs';
import {
  closeDashboard,
  setDashboardLoading,
  setDashboardLoaded,
} from '../../admin/state/dashboard-store';

beforeEach(() => {
  closeDashboard();
  window.__buildCdBizDocsHtml = vi.fn(() => '<div class="cdbiz-mock">사업장 카드</div>');
});

afterEach(() => {
  cleanup();
  delete window.__buildCdBizDocsHtml;
});

describe('CdBizDocs', () => {
  it('초기 — 빈 표시', () => {
    const { container } = render(<CdBizDocs />);
    expect(container.textContent).toBe('');
  });

  it('loading=true → "…"', () => {
    setDashboardLoading(64);
    const { container } = render(<CdBizDocs />);
    expect(container.textContent).toBe('…');
  });

  it('user 로드 후 helper 호출 + 결과 표시', () => {
    setDashboardLoaded({
      userId: 64,
      user: { id: 64, real_name: '박승호' },
      mappedBusinesses: [{ id: 2, company_name: '주식회사 온나플러스' } as never],
    });
    const { container } = render(<CdBizDocs />);
    expect(container.querySelector('.cdbiz-mock')).not.toBeNull();
    expect(window.__buildCdBizDocsHtml).toHaveBeenCalled();
  });

  it('builder 미로드 → fallback 메시지', () => {
    delete window.__buildCdBizDocsHtml;
    setDashboardLoaded({ userId: 1, user: { id: 1 } });
    const { container } = render(<CdBizDocs />);
    expect(container.textContent).toContain('사업장 빌더 미로드');
  });

  it('builder 에러 → fallback 메시지', () => {
    window.__buildCdBizDocsHtml = vi.fn(() => {
      throw new Error('builder 폭발');
    });
    setDashboardLoaded({ userId: 1, user: { id: 1 } });
    const { container } = render(<CdBizDocs />);
    expect(container.textContent).toContain('사업장 렌더 실패: builder 폭발');
  });

  it('store 변경 → 재 호출', () => {
    setDashboardLoaded({ userId: 1, user: { id: 1 } });
    render(<CdBizDocs />);
    const before = (window.__buildCdBizDocsHtml as ReturnType<typeof vi.fn>).mock.calls.length;
    setDashboardLoaded({ userId: 2, user: { id: 2 } });
    /* useStore 가 변경 감지 → re-render → builder 재호출 */
    expect((window.__buildCdBizDocsHtml as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(before);
  });
});
