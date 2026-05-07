import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchReviewList,
  markReviewed,
  fetchFaqList,
  createFaq,
  updateFaq,
  deleteFaq,
  setFaqVerified,
  fetchConversations,
} from './conversation-api';

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

describe('Review (검증)', () => {
  it('fetchReviewList default', async () => {
    mockResponse = { ok: true, items: [], total: 0 };
    await fetchReviewList();
    expect(lastUrl).toContain('admin-review');
    expect(lastUrl).not.toContain('confidence');
  });

  it('fetchReviewList confidence 필터', async () => {
    await fetchReviewList('낮음');
    expect(lastUrl).toContain('confidence=');
  });

  it('fetchReviewList reportedOnly', async () => {
    await fetchReviewList('all', true);
    expect(lastUrl).toContain('reported=1');
  });

  it('markReviewed default action', async () => {
    await markReviewed(123);
    expect(JSON.parse(String(lastInit.body))).toEqual({
      id: 123,
      action: 'mark_reviewed',
    });
  });

  it('markReviewed report_and_review', async () => {
    await markReviewed(123, 'report_and_review');
    expect(JSON.parse(String(lastInit.body)).action).toBe('report_and_review');
  });
});

describe('FAQ', () => {
  it('fetchFaqList all', async () => {
    mockResponse = { ok: true, faqs: [] };
    await fetchFaqList();
    expect(lastUrl).toContain('admin-faq');
    expect(lastUrl).not.toContain('status=');
  });

  it('fetchFaqList status 필터', async () => {
    await fetchFaqList('verified');
    expect(lastUrl).toContain('status=verified');
  });

  it('createFaq POST', async () => {
    mockResponse = { ok: true, id: 99 };
    await createFaq({ q_number: 'Q100', question: 'Q?', answer: 'A.' });
    expect(lastUrl).toContain('action=create');
    expect(JSON.parse(String(lastInit.body)).q_number).toBe('Q100');
  });

  it('updateFaq', async () => {
    await updateFaq(99, { answer: 'A2' });
    expect(lastUrl).toContain('action=update');
    expect(JSON.parse(String(lastInit.body))).toEqual({ id: 99, answer: 'A2' });
  });

  it('deleteFaq (manager+)', async () => {
    await deleteFaq(99);
    expect(lastUrl).toContain('action=delete');
    expect(JSON.parse(String(lastInit.body))).toEqual({ id: 99 });
  });

  it('setFaqVerified', async () => {
    await setFaqVerified(99, 'verified', '검토 완료');
    expect(lastUrl).toContain('action=set_verified');
    const body = JSON.parse(String(lastInit.body));
    expect(body.status).toBe('verified');
    expect(body.note).toBe('검토 완료');
  });
});

describe('Conversations', () => {
  it('fetchConversations default', async () => {
    mockResponse = { ok: true, rows: [] };
    await fetchConversations();
    expect(lastUrl).toContain('conversations');
  });

  it('user_id + limit', async () => {
    await fetchConversations({ userId: 64, limit: 50 });
    expect(lastUrl).toContain('user_id=64');
    expect(lastUrl).toContain('limit=50');
  });
});
