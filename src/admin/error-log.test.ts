/**
 * Phase #3 Phase 2: error-log .ts 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchErrorLogs, purgeOldLogs, purgeAllLogs, formatRelativeTime } from './error-log';

let lastUrl = '';
let lastInit: RequestInit = {};
let mockResponse: unknown = { ok: true };

beforeEach(() => {
  lastUrl = '';
  lastInit = {};
  mockResponse = { ok: true };
  global.fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    lastUrl = String(url);
    lastInit = init || {};
    return { json: async () => mockResponse } as Response;
  }) as typeof fetch;
  (globalThis as Record<string, unknown>).KEY = 'TEST_KEY';
});

describe('fetchErrorLogs', () => {
  it('limit 기본 200', async () => {
    mockResponse = { ok: true, errors: [], total: 0 };
    await fetchErrorLogs();
    expect(lastUrl).toContain('limit=200');
    expect(lastUrl).toContain('key=TEST_KEY');
  });

  it('limit 50', async () => {
    mockResponse = { ok: true, errors: [], total: 0 };
    await fetchErrorLogs(50);
    expect(lastUrl).toContain('limit=50');
  });

  it('error 응답 처리', async () => {
    mockResponse = { ok: false, error: 'unauth' };
    const r = await fetchErrorLogs();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unauth');
  });
});

describe('purgeOldLogs / purgeAllLogs', () => {
  it('purgeOldLogs DELETE + key', async () => {
    mockResponse = { ok: true, removed: 5 };
    const r = await purgeOldLogs();
    expect(lastInit.method).toBe('DELETE');
    expect(lastUrl).toContain('key=TEST_KEY');
    expect(lastUrl).not.toContain('all=1');
    if (r.ok) expect(r.removed).toBe(5);
  });

  it('purgeAllLogs DELETE + all=1', async () => {
    mockResponse = { ok: true, removed: 10 };
    const r = await purgeAllLogs();
    expect(lastInit.method).toBe('DELETE');
    expect(lastUrl).toContain('all=1');
    if (r.ok) expect(r.removed).toBe(10);
  });
});

describe('formatRelativeTime', () => {
  /* 기준: 2026-05-06 12:00:00 KST = 2026-05-06 03:00:00 UTC */
  const NOW_MS = Date.UTC(2026, 4, 6, 3, 0, 0);

  it('null/빈 → 빈 문자열', () => {
    expect(formatRelativeTime(null)).toBe('');
    expect(formatRelativeTime('')).toBe('');
  });

  it('1분 이내 → 방금', () => {
    expect(formatRelativeTime('2026-05-06 12:00:30', NOW_MS)).toBe('방금');
  });

  it('1시간 이내 → N분 전', () => {
    expect(formatRelativeTime('2026-05-06 11:55:00', NOW_MS)).toBe('5분 전');
  });

  it('1일 이내 → N시간 전', () => {
    expect(formatRelativeTime('2026-05-06 09:00:00', NOW_MS)).toBe('3시간 전');
  });

  it('1주 이내 → N일 전', () => {
    expect(formatRelativeTime('2026-05-04 12:00:00', NOW_MS)).toBe('2일 전');
  });

  it('1주 이상 → 날짜', () => {
    expect(formatRelativeTime('2026-04-20 12:00:00', NOW_MS)).toBe('2026-04-20');
  });

  it('잘못된 형식 → 그대로 반환', () => {
    expect(formatRelativeTime('not-a-date', NOW_MS)).toBe('not-a-date');
  });
});
