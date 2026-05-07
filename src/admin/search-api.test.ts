import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchAll, sendBulkMessage } from './search-api';

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

describe('searchAll', () => {
  it('q + key', async () => {
    mockResponse = { ok: true, users: [], businesses: [] };
    await searchAll('박승호');
    expect(lastUrl).toContain('admin-search');
    expect(lastUrl).toContain('q=');
    expect(lastUrl).toContain('key=TEST_KEY');
  });

  it('tag 옵션', async () => {
    await searchAll('부가세', { tag: '5월' });
    expect(lastUrl).toContain('tag=5%EC%9B%94');
  });

  it('error 응답', async () => {
    mockResponse = { ok: false, error: 'unauth' };
    const r = await searchAll('X');
    expect(r.ok).toBe(false);
  });
});

describe('sendBulkMessage', () => {
  it('정상 발송', async () => {
    mockResponse = { ok: true, sent: 5, failed: [] };
    const r = await sendBulkMessage({
      room_ids: ['R1', 'R2'],
      content: '단체 안내',
    });
    expect(lastInit.method).toBe('POST');
    expect(lastUrl).toContain('admin-bulk-send');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sent).toBe(5);
  });

  it('room_ids 200개 초과 → error', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `R${i}`);
    const r = await sendBulkMessage({ room_ids: ids, content: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('200개');
  });

  it('content 5000자 초과 → error', async () => {
    const r = await sendBulkMessage({
      room_ids: ['R1'],
      content: 'x'.repeat(5001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('5000');
  });

  it('attachments 10개 초과 → error', async () => {
    const atts = Array.from({ length: 11 }, () => ({
      type: 'image' as const,
      url: '/x.jpg',
    }));
    const r = await sendBulkMessage({
      room_ids: ['R1'],
      content: '',
      attachments: atts,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('10개');
  });

  it('attachments 정상', async () => {
    mockResponse = { ok: true, sent: 1, failed: [] };
    await sendBulkMessage({
      room_ids: ['R1'],
      content: '본문',
      attachments: [{ type: 'image', url: '/img.jpg' }],
    });
    expect(JSON.parse(String(lastInit.body)).attachments).toHaveLength(1);
  });
});
