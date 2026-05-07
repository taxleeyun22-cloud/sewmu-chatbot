/**
 * customer-dash-api 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchCustomerDashboard,
  fetchCustomerBusinesses,
  fetchCustomerMemos,
  fetchCustomerSummary,
  fetchCustomerFinance,
} from './customer-dash-api';

let lastUrl = '';
let mockResponse: unknown = { ok: true };

beforeEach(() => {
  lastUrl = '';
  mockResponse = { ok: true };
  global.fetch = vi.fn(async (url: URL | RequestInfo) => {
    lastUrl = String(url);
    return { json: async () => mockResponse } as Response;
  }) as typeof fetch;
  (globalThis as Record<string, unknown>).KEY = 'TEST_KEY';
});

describe('fetchCustomerDashboard', () => {
  it('user_id + key', async () => {
    mockResponse = { ok: true, user: { id: 64 }, businesses: [] };
    await fetchCustomerDashboard(64);
    expect(lastUrl).toContain('admin-clients');
    expect(lastUrl).toContain('user_id=64');
    expect(lastUrl).toContain('key=TEST_KEY');
  });

  it('error response', async () => {
    mockResponse = { ok: false, error: 'unauth' };
    const r = await fetchCustomerDashboard(64);
    expect(r.ok).toBe(false);
  });
});

describe('fetchCustomerBusinesses', () => {
  it('admin-businesses?user_id=N', async () => {
    mockResponse = { ok: true, businesses: [] };
    await fetchCustomerBusinesses(64);
    expect(lastUrl).toContain('admin-businesses');
    expect(lastUrl).toContain('user_id=64');
  });
});

describe('fetchCustomerMemos', () => {
  it('memos scope=customer_all', async () => {
    mockResponse = { ok: true, memos: [] };
    await fetchCustomerMemos(64);
    expect(lastUrl).toContain('scope=customer_all');
    expect(lastUrl).toContain('user_id=64');
  });
});

describe('fetchCustomerSummary', () => {
  it('default — cache_only X', async () => {
    mockResponse = { ok: true, summary: 'X', generated_at: '...', cached: false };
    await fetchCustomerSummary(64);
    expect(lastUrl).toContain('admin-customer-summary');
    expect(lastUrl).toContain('user_id=64');
    expect(lastUrl).not.toContain('cache_only');
  });

  it('cacheOnly=true → cache_only=1', async () => {
    await fetchCustomerSummary(64, true);
    expect(lastUrl).toContain('cache_only=1');
  });
});

describe('fetchCustomerFinance', () => {
  it('admin-finance?user_id=N', async () => {
    mockResponse = { ok: true, rows: [] };
    await fetchCustomerFinance(64);
    expect(lastUrl).toContain('admin-finance');
    expect(lastUrl).toContain('user_id=64');
  });
});
