/**
 * Phase #3 후속 (2026-05-06): 거래처 dashboard API wrapper .ts.
 *
 * admin-customer-dash.js 의 fetch 호출들을 type-safe wrapper.
 * admin.js / admin-customer-dash.js 본체는 그대로 — 점진 마이그레이션.
 *
 * 사용:
 *   import { fetchCustomerDashboard, fetchCustomerBusinesses } from '@/admin/customer-dash-api';
 *   const r = await fetchCustomerDashboard(64);
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
 * 거래처 user 정보
 * ============================================================ */

export interface CustomerUser {
  id: number;
  real_name: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  is_admin: 0 | 1;
  staff_role: 'manager' | 'staff' | null;
  created_at: string;
  last_login_at: string | null;
}

export interface FetchCustomerResponse {
  ok: true;
  user: CustomerUser;
  businesses: Array<{
    id: number;
    company_name: string;
    business_number: string | null;
    representative: string | null;
    is_primary: number;
  }>;
}

export async function fetchCustomerDashboard(
  userId: number,
): Promise<FetchCustomerResponse | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/admin-clients?key=${encodeURIComponent(key)}&user_id=${userId}`,
  );
  return safeJson<FetchCustomerResponse>(r);
}

/* ============================================================
 * 거래처 매핑 사업장 list
 * ============================================================ */

export interface BusinessMapping {
  id: number;
  company_name: string;
  business_number: string | null;
  representative: string | null;
  is_primary: number;
  industry?: string | null;
  tax_type?: string | null;
}

export interface FetchBusinessesResponse {
  ok: true;
  businesses: BusinessMapping[];
}

export async function fetchCustomerBusinesses(
  userId: number,
): Promise<FetchBusinessesResponse | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/admin-businesses?key=${encodeURIComponent(key)}&user_id=${userId}`,
  );
  return safeJson<FetchBusinessesResponse>(r);
}

/* ============================================================
 * 거래처 통합 메모 (memos scope=customer_all)
 * ============================================================ */

export async function fetchCustomerMemos(
  userId: number,
): Promise<{ ok: true; memos: Array<Record<string, unknown>> } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/memos?key=${encodeURIComponent(key)}&scope=customer_all&user_id=${userId}`,
  );
  return safeJson<{ ok: true; memos: Array<Record<string, unknown>> }>(r);
}

/* ============================================================
 * 거래처 자동 요약 (admin-customer-summary)
 * ============================================================ */

export interface CustomerSummaryResponse {
  ok: true;
  summary: string;
  generated_at: string;
  cached: boolean;
}

export async function fetchCustomerSummary(
  userId: number,
  cacheOnly: boolean = false,
): Promise<CustomerSummaryResponse | ApiErrorResponse> {
  const key = getKey();
  const url = `/api/admin-customer-summary?key=${encodeURIComponent(key)}&user_id=${userId}${cacheOnly ? '&cache_only=1' : ''}`;
  const r = await fetch(url);
  return safeJson<CustomerSummaryResponse>(r);
}

/* ============================================================
 * 거래처 재무 데이터 (client_finance)
 * ============================================================ */

export interface FinanceRow {
  id: number;
  user_id: number;
  period: string;
  period_type: string;
  revenue: number | null;
  cost: number | null;
  vat_payable: number | null;
  income_tax: number | null;
  taxable_income: number | null;
  payroll_total: number | null;
  source: string | null;
}

export async function fetchCustomerFinance(
  userId: number,
): Promise<{ ok: true; rows: FinanceRow[] } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/admin-finance?key=${encodeURIComponent(key)}&user_id=${userId}`,
  );
  return safeJson<{ ok: true; rows: FinanceRow[] }>(r);
}
