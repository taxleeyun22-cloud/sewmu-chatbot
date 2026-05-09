/**
 * Phase 3.14 (2026-05-09): FilingReviewList 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { FilingReviewList } from './FilingReviewList';
import {
  resetFilingReview,
  setFilingReviewList,
  setFilingReviewLoading,
  setFilingReviewError,
  type FilingReviewItem,
} from '../../admin/state/filing-review-store';

beforeEach(() => {
  resetFilingReview();
  window.__buildFilingReviewListHtml = vi.fn(() => {
    return '<div class="fil-mock">신고 검토 mock</div>';
  });
});

afterEach(() => {
  cleanup();
  delete window.__buildFilingReviewListHtml;
});

const makeFiling = (id: number): FilingReviewItem => ({
  id,
  fiscal_year: 2025,
  type: '종소세',
  review_status: '작성중',
});

describe('FilingReviewList', () => {
  it('초기 — 빈 fragment (owner 미설정)', () => {
    const { container } = render(<FilingReviewList />);
    expect(container.querySelector('.fil-mock')).toBeNull();
  });

  it('loading=true → 불러오는 중', () => {
    setFilingReviewLoading('Person', 64);
    const { container } = render(<FilingReviewList />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('error → 오류 메시지', () => {
    setFilingReviewError('서버 다운');
    const { container } = render(<FilingReviewList />);
    expect(container.textContent).toContain('오류: 서버 다운');
  });

  it('Person owner + filings → builder 호출 + mock html', () => {
    setFilingReviewList('Person', 64, [makeFiling(1)], '박승호');
    const { container } = render(<FilingReviewList />);
    expect(window.__buildFilingReviewListHtml).toHaveBeenCalled();
    expect(container.querySelector('.fil-mock')).toBeTruthy();
  });

  it('Business owner', () => {
    setFilingReviewList('Business', 5, [makeFiling(1)], '주식회사 테스트');
    const { container } = render(<FilingReviewList />);
    expect(container.querySelector('.fil-mock')).toBeTruthy();
  });

  it('expectedType=Person, store=Business → 빈 fragment', () => {
    setFilingReviewList('Business', 5, [makeFiling(1)]);
    const { container } = render(<FilingReviewList expectedType="Person" />);
    expect(container.querySelector('.fil-mock')).toBeNull();
  });

  it('expectedType=Person, store=Person → 표시', () => {
    setFilingReviewList('Person', 64, [makeFiling(1)]);
    const { container } = render(<FilingReviewList expectedType="Person" />);
    expect(container.querySelector('.fil-mock')).toBeTruthy();
  });

  it('store update → 자동 re-render', () => {
    setFilingReviewList('Person', 64, [makeFiling(1)]);
    const { container } = render(<FilingReviewList />);
    expect(container.querySelector('.fil-mock')).toBeTruthy();
    act(() => {
      setFilingReviewList('Person', 99, [makeFiling(2), makeFiling(3)]);
    });
    expect((window.__buildFilingReviewListHtml as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('builder 미로드 → fallback 메시지', () => {
    delete window.__buildFilingReviewListHtml;
    setFilingReviewList('Person', 64, [makeFiling(1)]);
    const { container } = render(<FilingReviewList />);
    expect(container.textContent).toContain('빌더 미로드');
  });
});
