/**
 * Phase #3 Phase 3-1 (2026-05-06): 상담방 메모 .ts 추출.
 *
 * admin.js 의 loadRoomMemos / _filterMemos / _normType / _dDayLabel /
 * _renderMemoList 의 순수 로직 부분을 .ts 모듈로.
 *
 * DOM 조작 부분은 admin.js 그대로 — 이 모듈은 데이터·필터·계산만.
 *
 * 사용:
 *   import { fetchRoomMemos, normalizeRoomMemoType, computeMemoCounts } from '@/admin/memos-room';
 */

import type { Memo } from '@/features/memos/state';

export type RoomMemoFilter = 'todo' | 'ref' | 'done' | 'all';

/* admin.js 의 _normType — 신규 3종 + 구버전 6종 매핑 */
export type RoomMemoTypeKey = '할 일' | '거래처 정보' | '완료';

interface ApiErrorResponse {
  ok: false;
  error: string;
}

function getKey(): string {
  if (typeof KEY === 'undefined') return '';
  return KEY || '';
}

/**
 * 메모 타입 → 통합 그룹 (구버전 자동 매핑).
 * @example
 *   normalizeRoomMemoType('확인필요')   // '할 일'
 *   normalizeRoomMemoType('완료처리')   // '완료'
 *   normalizeRoomMemoType('주의사항')   // '거래처 정보'
 */
export function normalizeRoomMemoType(memoType: string | null | undefined): RoomMemoTypeKey {
  const t = String(memoType || '').trim();
  if (t === '할 일' || t === '확인필요' || t === '고객요청') return '할 일';
  if (t === '완료' || t === '완료처리') return '완료';
  return '거래처 정보';
}

/**
 * 메모 배열에서 카운트 계산.
 */
export interface RoomMemoCounts {
  '할 일': number;
  '거래처 정보': number;
  '완료': number;
  total: number;
}

export function computeMemoCounts(memos: Memo[]): RoomMemoCounts {
  const counts: RoomMemoCounts = { '할 일': 0, '거래처 정보': 0, '완료': 0, total: memos.length };
  for (const m of memos) {
    const key = normalizeRoomMemoType(m.memo_type);
    counts[key]++;
  }
  return counts;
}

/**
 * 필터 적용 — 'todo' | 'ref' | 'done' | 'all'.
 */
export function filterRoomMemos(memos: Memo[], filter: RoomMemoFilter): Memo[] {
  if (filter === 'all') return memos;
  if (filter === 'todo') return memos.filter((m) => normalizeRoomMemoType(m.memo_type) === '할 일');
  if (filter === 'ref') return memos.filter((m) => normalizeRoomMemoType(m.memo_type) === '거래처 정보');
  if (filter === 'done') return memos.filter((m) => normalizeRoomMemoType(m.memo_type) === '완료');
  return memos;
}

/**
 * D-day 계산 (KST 자정 기준).
 * @example
 *   dDayLabel('2026-05-09', Date.UTC(2026,4,6,3,0,0))  // 'D-3'
 *   dDayLabel('2026-05-06', Date.UTC(2026,4,6,3,0,0))  // 'D-Day'
 *   dDayLabel('2026-05-04', Date.UTC(2026,4,6,3,0,0))  // 'D+2'
 */
export function dDayLabel(due: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!due) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const todayKst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const today = todayKst.toISOString().substring(0, 10);
  const diff = Math.round(
    (new Date(due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000,
  );
  if (diff === 0) return 'D-Day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

/**
 * 상담방 메모 fetch — scope=room_full.
 */
export interface FetchRoomMemosResponse {
  ok: true;
  memos: Memo[];
}

export async function fetchRoomMemos(
  roomId: string,
): Promise<FetchRoomMemosResponse | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/memos?scope=room_full&key=${encodeURIComponent(key)}&room_id=${encodeURIComponent(roomId)}`,
  );
  try {
    const d = (await r.json()) as { error?: string; memos?: Memo[] };
    if (d.error) return { ok: false, error: d.error };
    return { ok: true, memos: d.memos || [] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
