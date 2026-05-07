/**
 * Phase #3 Phase 2-3: tabs 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import {
  isValidTab,
  getTabFromHash,
  getCustFromHash,
  getRoomFromHash,
  buildHash,
  ADMIN_TABS,
} from './tabs';

describe('ADMIN_TABS 상수', () => {
  it('9종 (chat / live / rooms / users / docs / anal / review / faq / internal)', () => {
    expect(ADMIN_TABS.length).toBe(9);
    expect(ADMIN_TABS).toContain('chat');
    expect(ADMIN_TABS).toContain('users');
    expect(ADMIN_TABS).toContain('internal');
  });
});

describe('isValidTab', () => {
  it('유효한 탭 → true', () => {
    expect(isValidTab('chat')).toBe(true);
    expect(isValidTab('users')).toBe(true);
    expect(isValidTab('faq')).toBe(true);
  });

  it('잘못된 탭 → false', () => {
    expect(isValidTab('admin')).toBe(false);
    expect(isValidTab('invalid')).toBe(false);
    expect(isValidTab(null)).toBe(false);
    expect(isValidTab('')).toBe(false);
    expect(isValidTab(undefined)).toBe(false);
  });
});

describe('getTabFromHash', () => {
  it('#tab=users → users', () => {
    expect(getTabFromHash('#tab=users')).toBe('users');
  });

  it('#tab=users&cust=64 → users (cust 무시)', () => {
    expect(getTabFromHash('#tab=users&cust=64')).toBe('users');
  });

  it('#tab=invalid → null', () => {
    expect(getTabFromHash('#tab=invalid')).toBeNull();
  });

  it('빈 hash → null', () => {
    expect(getTabFromHash('')).toBeNull();
  });

  it('hash 형식 다름 → null', () => {
    expect(getTabFromHash('#users')).toBeNull();
    expect(getTabFromHash('?tab=users')).toBeNull();
  });
});

describe('getCustFromHash', () => {
  it('#tab=users&cust=64 → 64', () => {
    expect(getCustFromHash('#tab=users&cust=64')).toBe(64);
  });

  it('#cust=42 (단독)', () => {
    expect(getCustFromHash('#cust=42')).toBe(42);
  });

  it('cust 없음 → null', () => {
    expect(getCustFromHash('#tab=users')).toBeNull();
  });

  it('cust=0 또는 음수 → null', () => {
    expect(getCustFromHash('#tab=users&cust=0')).toBeNull();
  });
});

describe('getRoomFromHash', () => {
  it('#tab=rooms&room=Z2HBV2 → Z2HBV2', () => {
    expect(getRoomFromHash('#tab=rooms&room=Z2HBV2')).toBe('Z2HBV2');
  });

  it('URL encode 처리', () => {
    expect(getRoomFromHash('#tab=rooms&room=ROOM%20A')).toBe('ROOM A');
  });

  it('room 없음 → null', () => {
    expect(getRoomFromHash('#tab=rooms')).toBeNull();
  });
});

describe('buildHash', () => {
  it('tab 만 → #tab=X', () => {
    expect(buildHash({ tab: 'users' })).toBe('#tab=users');
  });

  it('tab + cust', () => {
    expect(buildHash({ tab: 'users', cust: 64 })).toBe('#tab=users&cust=64');
  });

  it('tab + room (encode)', () => {
    expect(buildHash({ tab: 'rooms', room: 'Z2HBV2' })).toBe('#tab=rooms&room=Z2HBV2');
    expect(buildHash({ tab: 'rooms', room: 'ROOM A' })).toBe('#tab=rooms&room=ROOM%20A');
  });

  it('tab + cust + room', () => {
    expect(buildHash({ tab: 'users', cust: 64, room: 'X' })).toBe('#tab=users&cust=64&room=X');
  });
});
