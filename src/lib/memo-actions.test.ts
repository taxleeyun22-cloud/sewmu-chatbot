/**
 * Phase #3 적용 확장 (2026-05-06): memo-actions wrapper 단위 테스트.
 *
 * fetch 를 모킹하고 wrapper 가 올바른 URL / method / body 호출하는지 확인.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listMemos,
  addMemo,
  updateMemo,
  deleteMemo,
  restoreMemo,
  purgeMemo,
  trashCount,
  isMemoError,
} from './memo-actions';

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
    return {
      json: async () => mockResponse,
    } as Response;
  }) as typeof fetch;
  /* admin.js KEY 모킹 */
  (globalThis as unknown as { window?: { KEY?: string } }).window = { KEY: 'TEST_KEY_123' };
});

describe('listMemos', () => {
  it('scope + user_id 쿼리 빌드', async () => {
    mockResponse = { ok: true, memos: [], total: 0 };
    const r = await listMemos({ scope: 'customer_all', user_id: 64 });
    expect(r.ok).toBe(true);
    expect(lastUrl).toContain('/api/memos?');
    expect(lastUrl).toContain('key=TEST_KEY_123');
    expect(lastUrl).toContain('scope=customer_all');
    expect(lastUrl).toContain('user_id=64');
  });

  it('boolean only_mine=true → 1, false → 생략', async () => {
    mockResponse = { ok: true, memos: [] };
    await listMemos({ scope: 'my', only_mine: true });
    expect(lastUrl).toContain('only_mine=1');
    await listMemos({ scope: 'my', only_mine: false });
    expect(lastUrl).not.toContain('only_mine');
  });
});

describe('trashCount', () => {
  it('scope=trash_count 호출', async () => {
    mockResponse = { ok: true, count: 5 };
    const r = await trashCount();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.count).toBe(5);
    expect(lastUrl).toContain('scope=trash_count');
  });
});

describe('addMemo', () => {
  it('POST + body JSON', async () => {
    mockResponse = { ok: true, id: 999 };
    await addMemo({ room_id: 'R123', memo_type: '할 일', content: '테스트' });
    expect(lastInit.method).toBe('POST');
    expect(lastInit.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(lastInit.body))).toEqual({
      room_id: 'R123',
      memo_type: '할 일',
      content: '테스트',
    });
  });
});

describe('updateMemo', () => {
  it('PATCH + id query + body', async () => {
    await updateMemo(42, { content: '수정' });
    expect(lastInit.method).toBe('PATCH');
    expect(lastUrl).toContain('id=42');
    expect(JSON.parse(String(lastInit.body))).toEqual({ content: '수정' });
  });
});

describe('deleteMemo / restoreMemo / purgeMemo', () => {
  it('deleteMemo → DELETE method', async () => {
    await deleteMemo(10);
    expect(lastInit.method).toBe('DELETE');
    expect(lastUrl).toContain('id=10');
  });

  it('restoreMemo → POST?action=restore', async () => {
    await restoreMemo(10);
    expect(lastInit.method).toBe('POST');
    expect(lastUrl).toContain('action=restore');
    expect(lastUrl).toContain('id=10');
  });

  it('purgeMemo → POST?action=purge', async () => {
    await purgeMemo(10);
    expect(lastInit.method).toBe('POST');
    expect(lastUrl).toContain('action=purge');
  });
});

describe('isMemoError 타입 가드', () => {
  it('ok:false → true', () => {
    const r: { ok: boolean } = { ok: false };
    expect(isMemoError(r)).toBe(true);
  });

  it('ok:true → false', () => {
    const r: { ok: boolean } = { ok: true };
    expect(isMemoError(r)).toBe(false);
  });
});
