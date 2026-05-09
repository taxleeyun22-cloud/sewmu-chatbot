import { describe, it, expect, beforeEach } from 'vitest';
import {
  setFilingReviewLoading,
  setFilingReviewList,
  setFilingReviewError,
  resetFilingReview,
  getFilingReview,
  subscribeFilingReview,
  initialFilingReviewState,
  type FilingReviewItem,
} from './filing-review-store';

beforeEach(() => resetFilingReview());

const makeFiling = (id: number, type = '종소세'): FilingReviewItem => ({
  id,
  fiscal_year: 2025,
  type,
  review_status: '작성중',
});

describe('filing-review-store', () => {
  it('초기 — ownerType null + 빈 list', () => {
    expect(initialFilingReviewState.ownerType).toBeNull();
    expect(initialFilingReviewState.filings).toEqual([]);
    expect(initialFilingReviewState.ownerName).toBe('');
  });

  it('setFilingReviewLoading + setFilingReviewList (Person)', () => {
    setFilingReviewLoading('Person', 64, '박승호');
    expect(getFilingReview().ownerType).toBe('Person');
    expect(getFilingReview().ownerId).toBe(64);
    expect(getFilingReview().ownerName).toBe('박승호');
    expect(getFilingReview().loading).toBe(true);
    setFilingReviewList('Person', 64, [makeFiling(1), makeFiling(2)]);
    expect(getFilingReview().filings.length).toBe(2);
    expect(getFilingReview().loading).toBe(false);
  });

  it('Business owner', () => {
    setFilingReviewList('Business', 5, [makeFiling(1, '법인세')], '주식회사 테스트');
    expect(getFilingReview().ownerType).toBe('Business');
    expect(getFilingReview().ownerName).toBe('주식회사 테스트');
  });

  it('setFilingReviewError', () => {
    setFilingReviewLoading('Person', 64);
    setFilingReviewError('서버 다운');
    expect(getFilingReview().error).toBe('서버 다운');
    expect(getFilingReview().loading).toBe(false);
  });

  it('resetFilingReview — 초기화', () => {
    setFilingReviewList('Person', 64, [makeFiling(1)]);
    resetFilingReview();
    expect(getFilingReview().ownerType).toBeNull();
    expect(getFilingReview().filings).toEqual([]);
  });

  it('subscribeFilingReview — 변경 알림', () => {
    let latest = getFilingReview();
    const unsub = subscribeFilingReview((s) => { latest = s; });
    setFilingReviewList('Person', 99, [makeFiling(1)]);
    expect(latest.ownerId).toBe(99);
    unsub();
  });

  it('window.__filingReviewStore global 노출', () => {
    expect(window.__filingReviewStore).toBeDefined();
    expect(typeof window.__filingReviewStore!.setList).toBe('function');
  });
});
