/**
 * Phase 신고서스크래핑-0 (2026-06-17): 스크래핑 어댑터 테스트.
 *
 * 검증: Mock 결정성 · provider 선택 · 오류 분류(retryable) · 정규화 형태 · 무실적.
 */
import { describe, it, expect } from 'vitest';
import {
  MockScrapeAdapter,
  getScrapeAdapter,
  type ScrapeQuery,
} from './scrape-adapter';

const q: ScrapeQuery = { type: '부가세', fiscalYear: 2024, periodLabel: '2024-1기' };

describe('getScrapeAdapter', () => {
  it('defaults to mock when SCRAPE_PROVIDER unset', () => {
    expect(getScrapeAdapter().name).toBe('mock');
    expect(getScrapeAdapter({}).name).toBe('mock');
    expect(getScrapeAdapter({ SCRAPE_PROVIDER: 'unknown' }).name).toBe('mock');
  });

  it('selects provider from env (case-insensitive)', () => {
    expect(getScrapeAdapter({ SCRAPE_PROVIDER: 'mock' }).name).toBe('mock');
    expect(getScrapeAdapter({ SCRAPE_PROVIDER: 'CODEF' }).name).toBe('codef');
    expect(getScrapeAdapter({ SCRAPE_PROVIDER: 'hyphen' }).name).toBe('hyphen');
  });

  it('real providers are not-implemented stubs (terminal error) until selected', async () => {
    const r = await getScrapeAdapter({ SCRAPE_PROVIDER: 'codef' }).fetchFilings('ref', q);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('not_implemented');
    expect(r.error?.retryable).toBe(false);
  });
});

describe('MockScrapeAdapter', () => {
  const mock = new MockScrapeAdapter();

  it('is deterministic for the same connectionRef + query', async () => {
    const a = await mock.fetchFilings('conn-1', q);
    const b = await mock.fetchFilings('conn-1', q);
    expect(a.normalized).toEqual(b.normalized);
    expect(a.ok).toBe(true);
  });

  it('differs across connectionRefs', async () => {
    const a = await mock.fetchFilings('conn-1', q);
    const b = await mock.fetchFilings('conn-2', q);
    expect(a.normalized?.revenue).not.toBe(b.normalized?.revenue);
  });

  it('produces normalized shape the reconciler expects', async () => {
    const r = await mock.fetchFilings('conn-1', q);
    expect(r.normalized?.revenue).toBeGreaterThan(0);
    expect(r.normalized?.decisive_tax).toBeGreaterThanOrEqual(0);
    expect(typeof r.normalized?.submitted).toBe('boolean');
    // 부가세는 vat 세부 포함
    expect(r.normalized?.vat).toMatchObject({ 매출세액: expect.any(Number) });
    // 원본은 그대로 보존
    expect(r.rawPayload).toBeTruthy();
  });

  it('marks past fiscal years as submitted, current/future as not', async () => {
    const past = await mock.fetchFilings('conn-1', { type: '종소세', fiscalYear: 2020 });
    const future = await mock.fetchFilings('conn-1', { type: '종소세', fiscalYear: 9999 });
    expect(past.normalized?.submitted).toBe(true);
    expect(past.normalized?.submitted_at).toBeTruthy();
    expect(future.normalized?.submitted).toBe(false);
  });

  it('empty- prefix → 무실적 (ok, zeros, not submitted)', async () => {
    const r = await mock.fetchFilings('empty-conn', q);
    expect(r.ok).toBe(true);
    expect(r.normalized?.revenue).toBe(0);
    expect(r.normalized?.submitted).toBe(false);
  });

  it('fail- prefix → terminal error (retryable=false)', async () => {
    const r = await mock.fetchFilings('fail-conn', q);
    expect(r.ok).toBe(false);
    expect(r.error?.retryable).toBe(false);
    expect(r.error?.code).toBe('auth_denied');
  });

  it('retry- prefix → retryable error (retryable=true)', async () => {
    const r = await mock.fetchFilings('retry-conn', q);
    expect(r.ok).toBe(false);
    expect(r.error?.retryable).toBe(true);
    expect(r.error?.code).toBe('auth_timeout');
  });

  it('non-VAT types omit vat detail', async () => {
    const r = await mock.fetchFilings('conn-1', { type: '법인세', fiscalYear: 2024 });
    expect(r.normalized?.vat).toBeUndefined();
  });
});
