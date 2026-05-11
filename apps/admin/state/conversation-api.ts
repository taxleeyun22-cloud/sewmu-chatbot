/**
 * 대화 / 검증 / FAQ API wrapper.
 * admin-anal-review-faq.js / admin-docs.js 의 fetch 호출 type-safe.
 */

interface ApiErrorResponse {
  ok: false;
  error: string;
}

function getKey(): string {
  if (typeof KEY === 'undefined') return '';
  return KEY || '';
}

async function safeJson<T>(r: Response): Promise<T | ApiErrorResponse> {
  try {
    return (await r.json()) as T | ApiErrorResponse;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ============================================================
 * 검증 (admin-review)
 * ============================================================ */

export type ConfidenceLevel = '높음' | '보통' | '낮음';

export interface ReviewItem {
  id: number;
  user_id: number;
  user_name: string | null;
  question: string;
  answer: string;
  confidence: ConfidenceLevel;
  reported: 0 | 1;
  reviewed: 0 | 1;
  created_at: string;
}

export interface ReviewListResponse {
  ok: true;
  items: ReviewItem[];
  total: number;
}

export async function fetchReviewList(
  filter: 'all' | ConfidenceLevel = 'all',
  reportedOnly: boolean = false,
): Promise<ReviewListResponse | ApiErrorResponse> {
  const key = getKey();
  const params = new URLSearchParams();
  params.set('key', key);
  if (filter !== 'all') params.set('confidence', filter);
  if (reportedOnly) params.set('reported', '1');
  const r = await fetch(`/api/admin-review?${params.toString()}`);
  return safeJson<ReviewListResponse>(r);
}

export async function markReviewed(
  id: number,
  action: 'mark_reviewed' | 'report_and_review' = 'mark_reviewed',
): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-review?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action }),
  });
  return safeJson<{ ok: true }>(r);
}

/* ============================================================
 * FAQ (admin-faq)
 * ============================================================ */

export interface FaqItem {
  id: number;
  q_number: string;
  question: string;
  answer: string;
  status: 'verified' | 'suspicious' | 'wrong' | 'unchecked';
  law_refs: string[];
  created_at: string;
}

export async function fetchFaqList(
  status?: FaqItem['status'],
): Promise<{ ok: true; faqs: FaqItem[] } | ApiErrorResponse> {
  const key = getKey();
  const params = new URLSearchParams();
  params.set('key', key);
  if (status) params.set('status', status);
  const r = await fetch(`/api/admin-faq?${params.toString()}`);
  return safeJson<{ ok: true; faqs: FaqItem[] }>(r);
}

export async function createFaq(body: {
  q_number: string;
  question: string;
  answer: string;
  law_refs?: string[];
}): Promise<{ ok: true; id: number } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-faq?key=${encodeURIComponent(key)}&action=create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return safeJson<{ ok: true; id: number }>(r);
}

export async function updateFaq(
  id: number,
  body: Partial<Pick<FaqItem, 'question' | 'answer' | 'law_refs'>>,
): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-faq?key=${encodeURIComponent(key)}&action=update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...body }),
  });
  return safeJson<{ ok: true }>(r);
}

/** FAQ 영구 삭제 — manager+ (Phase #10 RBAC). */
export async function deleteFaq(id: number): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-faq?key=${encodeURIComponent(key)}&action=delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return safeJson<{ ok: true }>(r);
}

export async function setFaqVerified(
  id: number,
  status: FaqItem['status'],
  note?: string,
): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-faq?key=${encodeURIComponent(key)}&action=set_verified`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, note }),
  });
  return safeJson<{ ok: true }>(r);
}

/* ============================================================
 * 대화 (conversations) — 진단 / 분석
 * ============================================================ */

export interface ConversationRow {
  id: number;
  user_id: number;
  user_name: string | null;
  question: string;
  answer: string;
  confidence: ConfidenceLevel;
  created_at: string;
}

export async function fetchConversations(
  opts: { userId?: number; limit?: number } = {},
): Promise<{ ok: true; rows: ConversationRow[] } | ApiErrorResponse> {
  const key = getKey();
  const params = new URLSearchParams();
  params.set('key', key);
  if (opts.userId) params.set('user_id', String(opts.userId));
  if (opts.limit) params.set('limit', String(opts.limit));
  const r = await fetch(`/api/conversations?${params.toString()}`);
  return safeJson<{ ok: true; rows: ConversationRow[] }>(r);
}
