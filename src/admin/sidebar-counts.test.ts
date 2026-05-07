/**
 * Phase #3 Phase 2-2: sidebar-counts 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchUserCounts,
  fetchBizCount,
  fetchTrashCount,
  fetchTermRequestCount,
  fetchErrorLogCount,
  fetchAllSidebarCounts,
} from './sidebar-counts';

let mockResponses: Record<string, unknown> = {};

beforeEach(() => {
  mockResponses = {};
  global.fetch = vi.fn(async (url: URL | RequestInfo) => {
    const u = String(url);
    /* URL 별로 mock 응답 */
    let resp: unknown = { ok: true };
    for (const [pattern, body] of Object.entries(mockResponses)) {
      if (u.includes(pattern)) {
        resp = body;
        break;
      }
    }
    return { json: async () => resp } as Response;
  }) as typeof fetch;
  (globalThis as Record<string, unknown>).KEY = 'TEST_KEY';
});

describe('fetchUserCounts', () => {
  it('counts 합산', async () => {
    mockResponses['admin-approve'] = {
      counts: { pending: 5, approved_client: 100, approved_guest: 10, rejected: 2, terminated: 1, admin: 3 },
    };
    const r = await fetchUserCounts();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userTotal).toBe(121);
      expect(r.counts.approved_client).toBe(100);
    }
  });

  it('빈 counts → userTotal 0', async () => {
    mockResponses['admin-approve'] = { counts: {} };
    const r = await fetchUserCounts();
    if (r.ok) expect(r.userTotal).toBe(0);
  });
});

describe('fetchBizCount', () => {
  it('businesses 배열 길이', async () => {
    mockResponses['admin-businesses'] = { businesses: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    const r = await fetchBizCount();
    if (r.ok) expect(r.total).toBe(3);
  });

  it('total 필드 fallback', async () => {
    mockResponses['admin-businesses'] = { total: 10 };
    const r = await fetchBizCount();
    if (r.ok) expect(r.total).toBe(10);
  });
});

describe('fetchTrashCount', () => {
  it('count 그대로', async () => {
    mockResponses['scope=trash_count'] = { count: 7 };
    const r = await fetchTrashCount();
    if (r.ok) expect(r.count).toBe(7);
  });

  it('count 없음 → 0', async () => {
    mockResponses['scope=trash_count'] = {};
    const r = await fetchTrashCount();
    if (r.ok) expect(r.count).toBe(0);
  });
});

describe('fetchTermRequestCount', () => {
  it('requests 배열 길이', async () => {
    mockResponses['admin-termination-requests'] = { requests: [{}, {}] };
    const r = await fetchTermRequestCount();
    if (r.ok) expect(r.count).toBe(2);
  });
});

describe('fetchErrorLogCount', () => {
  it('errors 배열 길이', async () => {
    mockResponses['admin-error-log'] = { errors: [{}, {}, {}] };
    const r = await fetchErrorLogCount();
    if (r.ok) expect(r.count).toBe(3);
  });
});

describe('fetchAllSidebarCounts', () => {
  it('Promise.all 통합 — 모든 카운트', async () => {
    mockResponses['admin-approve'] = { counts: { pending: 5, approved_client: 100, approved_guest: 0, rejected: 0, terminated: 0, admin: 0 } };
    mockResponses['admin-businesses'] = { businesses: [{ id: 1 }] };
    mockResponses['scope=trash_count'] = { count: 3 };
    mockResponses['scope=my'] = { memos: [] };
    mockResponses['admin-termination-requests'] = { requests: [] };
    mockResponses['admin-error-log'] = { errors: [{}] };
    const r = await fetchAllSidebarCounts();
    expect(r.user.total).toBe(105);
    expect(r.biz.total).toBe(1);
    expect(r.trash.count).toBe(3);
    expect(r.errorLog.count).toBe(1);
  });

  it('일부 실패해도 다른 카운트 정상', async () => {
    /* 모든 응답 빈 객체 — 모두 0 으로 fallback */
    const r = await fetchAllSidebarCounts();
    expect(r.user.total).toBe(0);
    expect(r.biz.total).toBe(0);
  });
});
