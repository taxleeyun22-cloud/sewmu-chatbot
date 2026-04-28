/**
 * Phase 2 Stage 2-2 — 거래처 API wrapper
 *
 * admin.js 안에서 fetch('/api/admin-rooms?...&key=...') 같은 패턴이 흩어져 있던 것을
 * 도메인 함수로 묶어서 다른 모듈이 호출 가능하게 노출.
 *
 * 사용 패턴:
 *   import { listClients, getBusiness, saveBusiness } from '@/features/clients/api';
 *   const clients = await listClients();
 *
 * 모든 함수는 features/shared/state 의 $key 를 자동으로 query 에 첨부.
 * Phase 2 진행 중 admin.js 의 거래처 fetch 호출이 여기로 점진 이전됨.
 */
import { api } from '@/lib/api';
import { $key } from '@/features/shared/state';
import type { Business, BizDoc, Finance, Memo, User } from '@/types';

function authQuery(extra: Record<string, string | number | undefined> = {}) {
  return { key: $key.get(), ...extra };
}

/* ============================================================
   거래처(Client) 목록 + 상세
   ============================================================ */

/** 거래처 목록 (admin-rooms 가 사실상 거래처 단위) */
export async function listClients(): Promise<User[]> {
  return api<User[]>('admin-rooms', { query: authQuery() });
}

/** 거래처 1 명 상세 (사용자 + 사업장 + 라벨 등 통합 응답) */
export async function getClient(userId: number): Promise<unknown> {
  return api(`admin-clients`, { query: authQuery({ user_id: userId }) });
}

/* ============================================================
   사업장(Business) CRUD
   ============================================================ */

/** 한 거래처의 사업장 목록 */
export async function listBusinesses(userId: number): Promise<Business[]> {
  return api<Business[]>('admin-businesses', {
    query: authQuery({ user_id: userId }),
  });
}

/** 사업장 1 개 상세 */
export async function getBusiness(bizId: number): Promise<Business> {
  return api<Business>('admin-businesses', { query: authQuery({ id: bizId }) });
}

/** 사업장 추가/수정 (UPSERT) */
export async function saveBusiness(biz: Partial<Business>): Promise<{ ok: true; id: number }> {
  return api('admin-businesses', {
    method: 'POST',
    query: authQuery(),
    body: biz,
  });
}

/** 사업장 삭제 */
export async function deleteBusiness(bizId: number): Promise<{ ok: true }> {
  return api('admin-businesses', {
    method: 'DELETE',
    query: authQuery({ id: bizId }),
  });
}

/* ============================================================
   거래처 핵심 서류(biz_docs)
   ============================================================ */

/** 사업장의 핵심 서류 목록 (사업자등록증 등) */
export async function listBizDocs(bizId: number): Promise<BizDoc[]> {
  return api<BizDoc[]>('admin-biz-docs', {
    query: authQuery({ business_id: bizId }),
  });
}

/* ============================================================
   거래처 재무(client_finance)
   ============================================================ */

/** 거래처 재무 행 목록 */
export async function listFinance(userId: number): Promise<Finance[]> {
  return api<Finance[]>('admin-finance', {
    query: authQuery({ user_id: userId }),
  });
}

/** 재무 요약 (분기별·연도별 합계) */
export async function getFinanceSummary(userId: number): Promise<unknown> {
  return api('admin-finance', {
    query: authQuery({ action: 'summary', user_id: userId }),
  });
}

/** 재무 행 추가/수정 (upsert) */
export async function upsertFinance(row: Partial<Finance>): Promise<{ ok: true; id: number }> {
  return api('admin-finance', {
    method: 'POST',
    query: authQuery({ action: 'upsert' }),
    body: row,
  });
}

/** 재무 행 삭제 */
export async function deleteFinance(id: number): Promise<{ ok: true }> {
  return api('admin-finance', {
    method: 'POST',
    query: authQuery({ action: 'delete' }),
    body: { id },
  });
}

/* ============================================================
   거래처 메모(memos)
   ============================================================ */

/** 거래처 메모 목록 (room_id 또는 user_id 기준) */
export async function listMemos(opts: { roomId?: number; userId?: number }): Promise<Memo[]> {
  const q: Record<string, string | number | undefined> = {};
  if (opts.roomId) q.room_id = opts.roomId;
  if (opts.userId) q.user_id = opts.userId;
  return api<Memo[]>('memos', { query: authQuery(q) });
}

/** 메모 추가 */
export async function addMemo(body: {
  room_id: number;
  user_id: number;
  body: string;
}): Promise<Memo> {
  return api<Memo>('memos', { method: 'POST', query: authQuery(), body });
}

/** 메모 수정 */
export async function updateMemo(id: number, body: string): Promise<{ ok: true }> {
  return api('memos', { method: 'PUT', query: authQuery({ id }), body: { body } });
}

/** 메모 삭제 */
export async function deleteMemo(id: number): Promise<{ ok: true }> {
  return api('memos', { method: 'DELETE', query: authQuery({ id }) });
}
