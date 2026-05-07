/**
 * Phase #3 Phase 2-2 (2026-05-06): 사이드바 카운트 fetch .ts 추출.
 *
 * admin.js 의 refreshSidebarCounts 안 fetch 들을 type-safe wrapper.
 * admin.js 본체는 그대로 — 이 모듈은 점진 마이그레이션 인프라.
 *
 * 사용:
 *   import { fetchUserCounts, fetchTrashCount, fetchUrgentTodos } from '@/admin/sidebar-counts';
 *   const r = await fetchUserCounts();
 *   if (r.ok) console.log(r.userTotal, r.bizTotal);
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
 * 사용자 / 업체 총합 카운트
 * ============================================================ */

export interface ApprovalCounts {
  pending: number;
  approved_client: number;
  approved_guest: number;
  rejected: number;
  terminated: number;
  admin: number;
}

export interface UserCountsResponse {
  ok: true;
  userTotal: number;
  counts: ApprovalCounts;
}

/**
 * 사용자 카운트 — admin-approve 응답 통합 (모든 status 합).
 */
export async function fetchUserCounts(): Promise<UserCountsResponse | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-approve?key=${encodeURIComponent(key)}&status=pending`);
  const d = await safeJson<{ counts?: Partial<ApprovalCounts> }>(r);
  if ('ok' in d && d.ok === false) return d;
  const c = (d as { counts?: Partial<ApprovalCounts> }).counts || {};
  const userTotal =
    (c.pending || 0) +
    (c.approved_client || 0) +
    (c.approved_guest || 0) +
    (c.rejected || 0) +
    (c.terminated || 0) +
    (c.admin || 0);
  const filled: ApprovalCounts = {
    pending: c.pending || 0,
    approved_client: c.approved_client || 0,
    approved_guest: c.approved_guest || 0,
    rejected: c.rejected || 0,
    terminated: c.terminated || 0,
    admin: c.admin || 0,
  };
  return { ok: true, userTotal, counts: filled };
}

/**
 * 업체 총 갯수.
 */
export async function fetchBizCount(): Promise<{ ok: true; total: number } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-businesses?key=${encodeURIComponent(key)}`);
  const d = await safeJson<{ businesses?: unknown[]; total?: number }>(r);
  if ('ok' in d && d.ok === false) return d;
  const list = (d as { businesses?: unknown[] }).businesses;
  const total = Array.isArray(list) ? list.length : (d as { total?: number }).total || 0;
  return { ok: true, total };
}

/* ============================================================
 * 휴지통 / 내 일정 / 종료 요청 / 에러 로그 카운트
 * ============================================================ */

export async function fetchTrashCount(): Promise<{ ok: true; count: number } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/memos?key=${encodeURIComponent(key)}&scope=trash_count`);
  const d = await safeJson<{ count?: number }>(r);
  if ('ok' in d && d.ok === false) return d;
  return { ok: true, count: (d as { count?: number }).count || 0 };
}

/**
 * 임박 일정 (오늘 + 오버듀 + 3일 이내).
 */
export async function fetchUrgentTodos(): Promise<
  { ok: true; count: number } | ApiErrorResponse
> {
  const key = getKey();
  const r = await fetch(`/api/memos?key=${encodeURIComponent(key)}&scope=my&only_mine=1`);
  const d = await safeJson<{ memos?: Array<{ due_date?: string }> }>(r);
  if ('ok' in d && d.ok === false) return d;
  const arr = ((d as { memos?: Array<{ due_date?: string }> }).memos || []).filter((m) => {
    if (!m.due_date) return false;
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
    today.setHours(0, 0, 0, 0);
    const limit = new Date(today.getTime() + 3 * 86400000);
    const dt = new Date(m.due_date + 'T00:00:00+09:00');
    return dt <= limit;
  });
  return { ok: true, count: arr.length };
}

export async function fetchTermRequestCount(): Promise<
  { ok: true; count: number } | ApiErrorResponse
> {
  const key = getKey();
  const r = await fetch(
    `/api/admin-termination-requests?key=${encodeURIComponent(key)}&status=pending`,
  );
  const d = await safeJson<{ requests?: unknown[] }>(r);
  if ('ok' in d && d.ok === false) return d;
  const list = (d as { requests?: unknown[] }).requests;
  return { ok: true, count: Array.isArray(list) ? list.length : 0 };
}

export async function fetchErrorLogCount(): Promise<
  { ok: true; count: number } | ApiErrorResponse
> {
  const key = getKey();
  const r = await fetch(`/api/admin-error-log?key=${encodeURIComponent(key)}&limit=200`);
  const d = await safeJson<{ errors?: unknown[] }>(r);
  if ('ok' in d && d.ok === false) return d;
  const list = (d as { errors?: unknown[] }).errors;
  return { ok: true, count: Array.isArray(list) ? list.length : 0 };
}

/* ============================================================
 * 통합 헬퍼 — 모든 카운트 한 번에 fetch (Promise.all)
 * ============================================================ */

export interface AllSidebarCounts {
  user: { total: number; counts: ApprovalCounts };
  biz: { total: number };
  trash: { count: number };
  urgent: { count: number };
  termReq: { count: number };
  errorLog: { count: number };
}

export async function fetchAllSidebarCounts(): Promise<AllSidebarCounts> {
  const [users, biz, trash, urgent, termReq, errorLog] = await Promise.all([
    fetchUserCounts(),
    fetchBizCount(),
    fetchTrashCount(),
    fetchUrgentTodos(),
    fetchTermRequestCount(),
    fetchErrorLogCount(),
  ]);
  return {
    user: 'ok' in users && users.ok
      ? { total: users.userTotal, counts: users.counts }
      : { total: 0, counts: { pending: 0, approved_client: 0, approved_guest: 0, rejected: 0, terminated: 0, admin: 0 } },
    biz: 'ok' in biz && biz.ok ? { total: biz.total } : { total: 0 },
    trash: 'ok' in trash && trash.ok ? { count: trash.count } : { count: 0 },
    urgent: 'ok' in urgent && urgent.ok ? { count: urgent.count } : { count: 0 },
    termReq: 'ok' in termReq && termReq.ok ? { count: termReq.count } : { count: 0 },
    errorLog: 'ok' in errorLog && errorLog.ok ? { count: errorLog.count } : { count: 0 },
  };
}
