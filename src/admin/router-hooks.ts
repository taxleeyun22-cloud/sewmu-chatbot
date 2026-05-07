/**
 * Phase #3 Phase 4-1 (2026-05-06): admin SPA 라우팅 helper .ts.
 *
 * admin.js 의 popstate handler / 첫 진입 hash / deep link 로직 type-safe.
 * tabs.ts 의 helper 와 결합.
 *
 * 사용:
 *   import { parseHashState, buildHistoryState } from '@/admin/router-hooks';
 *   const state = parseHashState(location.hash);
 *   if (state.tab === 'users' && state.cust) navigate(state);
 */

import { isValidTab, getTabFromHash, getCustFromHash, getRoomFromHash } from './tabs';
import type { AdminTab } from './tabs';

export interface HashState {
  /** 'users' / 'rooms' / etc — 또는 null (잘못된 hash) */
  tab: AdminTab | null;
  /** 거래처 dashboard user_id (deep link) */
  cust: number | null;
  /** 상담방 ID (deep link) */
  room: string | null;
}

/**
 * URL hash 전체 파싱 — { tab, cust, room }.
 *
 * @example
 *   parseHashState('#tab=users&cust=64')         // { tab:'users', cust:64, room:null }
 *   parseHashState('#tab=rooms&room=Z2HBV2')     // { tab:'rooms', cust:null, room:'Z2HBV2' }
 *   parseHashState('')                            // { tab:null, cust:null, room:null }
 */
export function parseHashState(hash: string): HashState {
  return {
    tab: getTabFromHash(hash),
    cust: getCustFromHash(hash),
    room: getRoomFromHash(hash),
  };
}

/**
 * popstate event.state 파싱 — admin.js 의 history.pushState({adminTab, cust, room}) 패턴.
 */
export interface PopstateState {
  adminTab?: string;
  cust?: number;
  room?: string;
}

export function parsePopstateState(state: unknown): HashState {
  if (!state || typeof state !== 'object') {
    return { tab: null, cust: null, room: null };
  }
  const s = state as PopstateState;
  return {
    tab: isValidTab(s.adminTab) ? s.adminTab : null,
    cust: typeof s.cust === 'number' && s.cust > 0 ? s.cust : null,
    room: typeof s.room === 'string' && s.room ? s.room : null,
  };
}

/**
 * popstate 또는 hash 둘 다 시도 — state 우선, 없으면 hash fallback.
 */
export function resolveHashOrState(
  state: unknown,
  hash: string,
): HashState {
  const fromState = parsePopstateState(state);
  if (fromState.tab) return fromState;  /* state 가 있으면 그대로 */
  return parseHashState(hash);
}

/**
 * pushState 용 history state 객체 빌드.
 */
export function buildHistoryState(opts: {
  tab: AdminTab;
  cust?: number;
  room?: string;
}): PopstateState {
  const state: PopstateState = { adminTab: opts.tab };
  if (opts.cust) state.cust = opts.cust;
  if (opts.room) state.room = opts.room;
  return state;
}

/**
 * 두 HashState 비교 — 변경 사항 있는지.
 * tab/cust/room 셋 다 같으면 true.
 */
export function isSameHashState(a: HashState, b: HashState): boolean {
  return a.tab === b.tab && a.cust === b.cust && a.room === b.room;
}
