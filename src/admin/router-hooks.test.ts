/**
 * Phase #3 Phase 4-1: router-hooks 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import {
  parseHashState,
  parsePopstateState,
  resolveHashOrState,
  buildHistoryState,
  isSameHashState,
} from './router-hooks';

describe('parseHashState', () => {
  it('빈 hash → 모두 null', () => {
    expect(parseHashState('')).toEqual({ tab: null, cust: null, room: null });
  });

  it('#tab=users 만', () => {
    expect(parseHashState('#tab=users')).toEqual({ tab: 'users', cust: null, room: null });
  });

  it('#tab=users&cust=64', () => {
    expect(parseHashState('#tab=users&cust=64')).toEqual({
      tab: 'users',
      cust: 64,
      room: null,
    });
  });

  it('#tab=rooms&room=Z2HBV2', () => {
    expect(parseHashState('#tab=rooms&room=Z2HBV2')).toEqual({
      tab: 'rooms',
      cust: null,
      room: 'Z2HBV2',
    });
  });

  it('잘못된 tab → tab:null', () => {
    expect(parseHashState('#tab=invalid')).toEqual({ tab: null, cust: null, room: null });
  });
});

describe('parsePopstateState', () => {
  it('null/undefined → 모두 null', () => {
    expect(parsePopstateState(null)).toEqual({ tab: null, cust: null, room: null });
    expect(parsePopstateState(undefined)).toEqual({ tab: null, cust: null, room: null });
  });

  it('adminTab + cust', () => {
    const r = parsePopstateState({ adminTab: 'users', cust: 64 });
    expect(r.tab).toBe('users');
    expect(r.cust).toBe(64);
  });

  it('adminTab + room', () => {
    const r = parsePopstateState({ adminTab: 'rooms', room: 'Z2HBV2' });
    expect(r.tab).toBe('rooms');
    expect(r.room).toBe('Z2HBV2');
  });

  it('잘못된 adminTab → null', () => {
    const r = parsePopstateState({ adminTab: 'invalid' });
    expect(r.tab).toBeNull();
  });

  it('cust=0 → null', () => {
    const r = parsePopstateState({ adminTab: 'users', cust: 0 });
    expect(r.cust).toBeNull();
  });
});

describe('resolveHashOrState', () => {
  it('state 우선 — state 있으면 hash 무시', () => {
    const r = resolveHashOrState({ adminTab: 'rooms', room: 'A' }, '#tab=users&cust=64');
    expect(r.tab).toBe('rooms');
    expect(r.room).toBe('A');
    expect(r.cust).toBeNull();  /* state 의 cust 없음 */
  });

  it('state 없음 → hash 사용', () => {
    const r = resolveHashOrState(null, '#tab=users&cust=64');
    expect(r.tab).toBe('users');
    expect(r.cust).toBe(64);
  });

  it('state 의 tab 잘못 → hash fallback', () => {
    const r = resolveHashOrState({ adminTab: 'invalid' }, '#tab=users');
    expect(r.tab).toBe('users');
  });
});

describe('buildHistoryState', () => {
  it('tab 만', () => {
    expect(buildHistoryState({ tab: 'users' })).toEqual({ adminTab: 'users' });
  });

  it('tab + cust', () => {
    expect(buildHistoryState({ tab: 'users', cust: 64 })).toEqual({
      adminTab: 'users',
      cust: 64,
    });
  });

  it('tab + room', () => {
    expect(buildHistoryState({ tab: 'rooms', room: 'Z' })).toEqual({
      adminTab: 'rooms',
      room: 'Z',
    });
  });
});

describe('isSameHashState', () => {
  it('완전 같음 → true', () => {
    expect(
      isSameHashState(
        { tab: 'users', cust: 64, room: null },
        { tab: 'users', cust: 64, room: null },
      ),
    ).toBe(true);
  });

  it('cust 다름 → false', () => {
    expect(
      isSameHashState(
        { tab: 'users', cust: 64, room: null },
        { tab: 'users', cust: 65, room: null },
      ),
    ).toBe(false);
  });

  it('tab 다름 → false', () => {
    expect(
      isSameHashState(
        { tab: 'users', cust: null, room: null },
        { tab: 'rooms', cust: null, room: null },
      ),
    ).toBe(false);
  });
});
