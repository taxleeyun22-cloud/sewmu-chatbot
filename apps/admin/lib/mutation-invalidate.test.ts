/**
 * Phase 14 (2026-05-12): mutation-invalidate 단위 테스트.
 */
import { describe, it, expect, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateAfter } from './mutation-invalidate';

function makeMockClient(): {
  qc: QueryClient;
  calls: Array<{ queryKey: unknown[] }>;
} {
  const calls: Array<{ queryKey: unknown[] }> = [];
  const qc = {
    invalidateQueries: vi.fn((opts: { queryKey: unknown[] }) => {
      calls.push(opts);
    }),
  } as unknown as QueryClient;
  return { qc, calls };
}

describe('invalidateAfter', () => {
  it('default → sidebar 만 invalidate (dashboard.counts)', () => {
    const { qc, calls } = makeMockClient();
    invalidateAfter(qc);
    expect(calls).toHaveLength(1);
    expect(calls[0].queryKey).toEqual(['dashboard.counts']);
  });

  it('users: true → users.* + dashboard.counts', () => {
    const { qc, calls } = makeMockClient();
    invalidateAfter(qc, { users: true });
    const keys = calls.map((c) => c.queryKey[0]);
    expect(keys).toContain('dashboard.counts');
    expect(keys).toContain('users.list');
    expect(keys).toContain('users.byId');
    expect(keys).toContain('customer.dashboard');
  });

  it('businesses: true → businesses.* + dashboard.counts', () => {
    const { qc, calls } = makeMockClient();
    invalidateAfter(qc, { businesses: true });
    const keys = calls.map((c) => c.queryKey[0]);
    expect(keys).toContain('businesses.list');
    expect(keys).toContain('customer.businessDashboard');
  });

  it('sidebar: false → invalidate skip', () => {
    const { qc, calls } = makeMockClient();
    invalidateAfter(qc, { sidebar: false });
    expect(calls).toHaveLength(0);
  });

  it('여러 scope 동시 → 모두 invalidate', () => {
    const { qc, calls } = makeMockClient();
    invalidateAfter(qc, { users: true, businesses: true, rooms: true });
    const keys = calls.map((c) => c.queryKey[0]);
    expect(keys).toContain('users.list');
    expect(keys).toContain('businesses.list');
    expect(keys).toContain('rooms.list');
  });

  it('알 수 없는 scope → 그냥 skip (안전)', () => {
    const { qc, calls } = makeMockClient();
    /* TypeScript 가 막아주지만 런타임 안전성 확인 */
    invalidateAfter(qc, { sidebar: false, users: false });
    expect(calls).toHaveLength(0);
  });

  it('memos / documents / filings 도 매핑', () => {
    const { qc, calls } = makeMockClient();
    invalidateAfter(qc, { memos: true, documents: true, filings: true });
    const keys = calls.map((c) => c.queryKey[0]);
    expect(keys).toContain('memos.list');
    expect(keys).toContain('documents.list');
    expect(keys).toContain('filings.list');
  });
});
