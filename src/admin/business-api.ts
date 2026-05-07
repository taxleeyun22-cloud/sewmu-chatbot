/**
 * 업체(business) API wrapper.
 * admin-business-tab.js / admin-customer-dash.js 의 fetch 호출 type-safe.
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

export interface Business {
  id: number;
  company_name: string;
  business_number: string | null;
  representative: string | null;
  industry: string | null;
  tax_type: '일반과세' | '간이과세' | '면세' | null;
  open_date: string | null;
  is_active: 0 | 1;
  is_primary?: number;
}

export interface ListBusinessesResponse {
  ok: true;
  businesses: Business[];
}

/** 업체 list (전체 또는 user_id 기준 매핑 사업장). */
export async function fetchBusinesses(
  opts: { userId?: number; search?: string } = {},
): Promise<ListBusinessesResponse | ApiErrorResponse> {
  const key = getKey();
  const params = new URLSearchParams();
  params.set('key', key);
  if (opts.userId) params.set('user_id', String(opts.userId));
  if (opts.search) params.set('search', opts.search);
  const r = await fetch(`/api/admin-businesses?${params.toString()}`);
  return safeJson<ListBusinessesResponse>(r);
}

/** 단일 업체 상세. */
export async function fetchBusinessDetail(
  bizId: number,
): Promise<{ ok: true; business: Business } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-businesses?key=${encodeURIComponent(key)}&id=${bizId}`);
  return safeJson<{ ok: true; business: Business }>(r);
}

/** 업체 추가/수정 (UPSERT). */
export async function saveBusiness(
  body: Partial<Business> & { id?: number },
): Promise<{ ok: true; id: number } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-businesses?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return safeJson<{ ok: true; id: number }>(r);
}

/** 사용자 ↔ 업체 매핑 추가 (action=add_to_user). */
export async function addBusinessToUser(
  userId: number,
  business: { business_id?: number; business_number?: string; company_name?: string },
  isPrimary: boolean = false,
): Promise<{ ok: true; id: number } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-businesses?key=${encodeURIComponent(key)}&action=add_to_user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, ...business, is_primary: isPrimary ? 1 : 0 }),
  });
  return safeJson<{ ok: true; id: number }>(r);
}

/** 업체 삭제 (owner only — Phase #10 RBAC). */
export async function deleteBusiness(
  bizId: number,
): Promise<{ ok: true; cascaded_memos?: number } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/admin-businesses?key=${encodeURIComponent(key)}&action=delete&id=${bizId}`,
    { method: 'DELETE' },
  );
  return safeJson<{ ok: true; cascaded_memos?: number }>(r);
}

/* ============================================================
 * room ↔ business 매핑 (Phase M11 N:N)
 * ============================================================ */

export async function fetchRoomBusinesses(
  roomId: string,
): Promise<{ ok: true; businesses: Business[] } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/admin-room-businesses?key=${encodeURIComponent(key)}&room_id=${encodeURIComponent(roomId)}`,
  );
  return safeJson<{ ok: true; businesses: Business[] }>(r);
}

export async function linkRoomBusiness(
  roomId: string,
  businessId: number,
  isPrimary: boolean = false,
): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-room-businesses?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, business_id: businessId, is_primary: isPrimary ? 1 : 0 }),
  });
  return safeJson<{ ok: true }>(r);
}

export async function unlinkRoomBusiness(
  roomId: string,
  businessId: number,
): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/admin-room-businesses?key=${encodeURIComponent(key)}&room_id=${encodeURIComponent(roomId)}&business_id=${businessId}`,
    { method: 'DELETE' },
  );
  return safeJson<{ ok: true }>(r);
}
