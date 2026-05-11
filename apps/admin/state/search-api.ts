/**
 * 전역 검색 + 단체발송 API wrapper.
 * admin-search-bulk.js 의 fetch 호출 type-safe.
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
 * 통합 검색 (admin-search)
 * ============================================================ */

export interface SearchHit {
  type: 'user' | 'business' | 'memo' | 'message';
  id: number | string;
  title: string;
  preview?: string;
  user_id?: number;
  business_id?: number;
  room_id?: string;
  category?: string;
  tags?: string[];
}

export interface SearchResponse {
  ok: true;
  users: Array<{
    id: number;
    real_name: string | null;
    name: string | null;
    phone: string | null;
    is_admin: 0 | 1;
  }>;
  businesses: Array<{
    id: number;
    company_name: string;
    business_number: string | null;
    representative: string | null;
  }>;
  memos?: Array<{
    id: number;
    content: string;
    target_user_id: number | null;
    target_business_id: number | null;
    category: string | null;
    tags: string[];
    created_at: string;
  }>;
}

export async function searchAll(
  query: string,
  opts: { tag?: string } = {},
): Promise<SearchResponse | ApiErrorResponse> {
  const key = getKey();
  const params = new URLSearchParams();
  params.set('key', key);
  params.set('q', query);
  if (opts.tag) params.set('tag', opts.tag);
  const r = await fetch(`/api/admin-search?${params.toString()}`);
  return safeJson<SearchResponse>(r);
}

/* ============================================================
 * 단체 발송 (admin-bulk-send) — manager+ (Phase #10)
 * ============================================================ */

export interface BulkSendBody {
  room_ids: string[];
  content: string;
  attachments?: Array<{
    type: 'image' | 'file';
    url: string;
    name?: string;
    size?: number;
  }>;
}

export interface BulkSendResponse {
  ok: true;
  sent: number;
  failed: string[];
}

export async function sendBulkMessage(
  body: BulkSendBody,
): Promise<BulkSendResponse | ApiErrorResponse> {
  const key = getKey();
  /* room_ids 200개 제한 + content 5000자 + attachments 10개 — backend 검증 */
  if (body.room_ids.length > 200) {
    return { ok: false, error: 'room_ids 200개 초과' };
  }
  if (body.content.length > 5000) {
    return { ok: false, error: 'content 5000자 초과' };
  }
  if (body.attachments && body.attachments.length > 10) {
    return { ok: false, error: 'attachments 10개 초과' };
  }
  const r = await fetch(`/api/admin-bulk-send?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return safeJson<BulkSendResponse>(r);
}
