/**
 * Phase #3 적용 확장 (2026-05-06): type-safe 메모 CRUD wrapper.
 *
 * 목적:
 *   - admin-memos.js 의 fetch('/api/memos?...') 들이 어떤 응답 형식 기대하는지
 *     타입으로 명시. 향후 admin-memos.js 가 이 wrapper 호출 시 컴파일 타입 검증.
 *   - 응답 형식 변경 시 컴파일 에러로 즉시 발견.
 *   - admin-memos.js 가 점진 .ts 변환될 때 import 가능.
 *
 * 사용 (classic script):
 *   const r = await window.__memoActions.list({ scope: 'customer_all', user_id: 64 });
 *   if (r.ok) console.log(r.memos);
 *
 * 사용 (TypeScript):
 *   import { listMemos, addMemo, deleteMemo } from '@/lib/memo-actions';
 */

import type { Memo } from '@/features/memos/state';

/* ============================================================
 * 타입 정의 — backend functions/api/memos.js 응답 스키마
 * ============================================================ */

export type MemoScope =
  | 'room'
  | 'room_full'
  | 'customer_info'
  | 'customer_all'
  | 'business_info'
  | 'business_all'
  | 'business_due'
  | 'my'
  | 'trash_count'
  | 'trash_list';

export interface ListMemosParams {
  scope: MemoScope;
  room_id?: string;
  user_id?: number;
  business_id?: number;
  category?: string;
  tag?: string;
  only_mine?: boolean;
}

export interface ListMemosResponse {
  ok: true;
  memos: Memo[];
  total?: number;
}

export interface CountResponse {
  ok: true;
  count: number;
}

export interface AddMemoBody {
  room_id?: string;
  target_user_id?: number;
  target_business_id?: number;
  memo_type: string;
  content: string;
  category?: string;
  tags?: string[] | null;
  due_date?: string | null;
  attachments?: Array<{ key: string; name: string; size: number; mime: string }>;
}

export interface AddMemoResponse {
  ok: true;
  id: number;
  memo: Memo;
}

export interface UpdateMemoBody {
  memo_type?: string;
  content?: string;
  category?: string;
  tags?: string[];
  due_date?: string | null;
}

export interface MemoErrorResponse {
  ok: false;
  error: string;
}

/* ============================================================
 * Helpers
 * ============================================================ */

function getKey(): string {
  /* admin.js / staff.js 가 KEY var 사용. classic script global 에서 읽기 */
  try {
    return (window as unknown as { KEY?: string }).KEY || '';
  } catch {
    return '';
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  const k = getKey();
  if (k) parts.push(`key=${encodeURIComponent(k)}`);
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') {
      if (value) parts.push(`${name}=1`);
    } else {
      parts.push(`${name}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function jsonOrError<T>(r: Response): Promise<T | MemoErrorResponse> {
  try {
    const d = await r.json();
    return d as T | MemoErrorResponse;
  } catch (e) {
    return { ok: false, error: (e as Error).message } as MemoErrorResponse;
  }
}

/* ============================================================
 * CRUD 함수들
 * ============================================================ */

/** 메모 목록 — scope 별 필터링 */
export async function listMemos(
  params: ListMemosParams,
): Promise<ListMemosResponse | MemoErrorResponse> {
  const r = await fetch(`/api/memos${buildQuery({ ...params })}`);
  return jsonOrError<ListMemosResponse>(r);
}

/** 휴지통 카운트 */
export async function trashCount(): Promise<CountResponse | MemoErrorResponse> {
  const r = await fetch(`/api/memos${buildQuery({ scope: 'trash_count' })}`);
  return jsonOrError<CountResponse>(r);
}

/** 메모 작성 */
export async function addMemo(body: AddMemoBody): Promise<AddMemoResponse | MemoErrorResponse> {
  const r = await fetch(`/api/memos${buildQuery({})}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return jsonOrError<AddMemoResponse>(r);
}

/** 메모 수정 (PATCH) */
export async function updateMemo(
  id: number,
  body: UpdateMemoBody,
): Promise<{ ok: true } | MemoErrorResponse> {
  const r = await fetch(`/api/memos${buildQuery({ id })}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return jsonOrError<{ ok: true }>(r);
}

/** 메모 삭제 (soft — 휴지통으로 이동) */
export async function deleteMemo(id: number): Promise<{ ok: true } | MemoErrorResponse> {
  const r = await fetch(`/api/memos${buildQuery({ id })}`, { method: 'DELETE' });
  return jsonOrError<{ ok: true }>(r);
}

/** 메모 복원 (휴지통 → 일반) — staff 가능 */
export async function restoreMemo(id: number): Promise<{ ok: true } | MemoErrorResponse> {
  const r = await fetch(`/api/memos${buildQuery({ action: 'restore', id })}`, {
    method: 'POST',
  });
  return jsonOrError<{ ok: true }>(r);
}

/** 메모 영구 삭제 — manager+ 만 가능 (Phase #10 RBAC) */
export async function purgeMemo(id: number): Promise<{ ok: true } | MemoErrorResponse> {
  const r = await fetch(`/api/memos${buildQuery({ action: 'purge', id })}`, {
    method: 'POST',
  });
  return jsonOrError<{ ok: true }>(r);
}

/* ============================================================
 * 응답 타입 가드
 * ============================================================ */

export function isMemoError(r: { ok: boolean }): r is MemoErrorResponse {
  return !r.ok;
}
