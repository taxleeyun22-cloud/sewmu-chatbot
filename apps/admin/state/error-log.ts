/**
 * Phase #3 Phase 2 (2026-05-06): 에러 로그 모달 함수 .ts 추출.
 *
 * admin.js 의 openErrorLog / closeErrorLog / loadErrorLog / purgeOldErrorLogs /
 * purgeAllErrorLogs / _errLogAgo 함수의 type-safe 버전.
 *
 * admin.js 본체 plain JS 그대로 — 이 모듈은 추가 wrapper.
 * 향후 admin.js 의 해당 함수들이 이 모듈을 호출하도록 점진 마이그레이션.
 *
 * 사용 (TypeScript):
 *   import { fetchErrorLogs, purgeOldLogs, formatRelativeTime } from '@/admin/error-log';
 *   const r = await fetchErrorLogs();
 *   if (r.ok) console.log(r.errors);
 */

export interface ErrorLogEntry {
  id: number;
  created_at: string;
  source: string;
  message: string;
  stack?: string;
  url?: string;
  user_agent?: string;
  user_id?: number | null;
  ip?: string;
}

export interface ErrorLogListResponse {
  ok: true;
  errors: ErrorLogEntry[];
  total: number;
}

export interface ErrorLogPurgeResponse {
  ok: true;
  removed: number;
}

export interface ErrorLogErrorResponse {
  ok: false;
  error: string;
}

function getKey(): string {
  if (typeof KEY === 'undefined') return '';
  return KEY || '';
}

/**
 * GET /api/admin-error-log — 최근 에러 200건.
 */
export async function fetchErrorLogs(
  limit = 200,
): Promise<ErrorLogListResponse | ErrorLogErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-error-log?key=${encodeURIComponent(key)}&limit=${limit}`);
  try {
    return (await r.json()) as ErrorLogListResponse | ErrorLogErrorResponse;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * DELETE /api/admin-error-log — 7일 지난 거 삭제 (모든 admin).
 */
export async function purgeOldLogs(): Promise<ErrorLogPurgeResponse | ErrorLogErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-error-log?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  try {
    return (await r.json()) as ErrorLogPurgeResponse | ErrorLogErrorResponse;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * DELETE /api/admin-error-log?all=1 — 전체 삭제 (owner only).
 */
export async function purgeAllLogs(): Promise<ErrorLogPurgeResponse | ErrorLogErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-error-log?all=1&key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  try {
    return (await r.json()) as ErrorLogPurgeResponse | ErrorLogErrorResponse;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * created_at (KST 'YYYY-MM-DD HH:MM:SS') → 사람 친화 상대 시간.
 * @example
 *   formatRelativeTime('2026-05-06 12:00:00')  // '방금', '5분 전', etc
 */
export function formatRelativeTime(ts: string | null | undefined, nowMs: number = Date.now()): string {
  if (!ts) return '';
  try {
    /* KST 표기 'YYYY-MM-DD HH:MM:SS' → UTC 기준 ms 로 변환 (KST=UTC+9 가정) */
    const m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return ts;
    const [, y, mo, d, h, mi, s] = m;
    const tsMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    /* nowMs 는 사용자 local — KST 환경 가정 (사장님 한국). 차이 단순 비교 */
    const diffSec = (nowMs + 9 * 60 * 60 * 1000 - tsMs) / 1000;
    if (diffSec < 60) return '방금';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + '분 전';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + '시간 전';
    if (diffSec < 86400 * 7) return Math.floor(diffSec / 86400) + '일 전';
    return ts.substring(0, 10);
  } catch {
    return ts || '';
  }
}
