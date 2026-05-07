/**
 * Phase #3 Phase 3-2: auth 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchAdminWhoami,
  getStoredKey,
  setStoredKey,
  clearStoredKey,
  isOwnerSession,
  isManagerSession,
  isStaffSession,
} from './auth';

beforeEach(() => {
  /* sessionStorage / localStorage 정리 */
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* noop */ }
  delete (globalThis as Record<string, unknown>).KEY;
  delete (globalThis as Record<string, unknown>).IS_OWNER;
  delete (globalThis as Record<string, unknown>).IS_MANAGER;
  delete (globalThis as Record<string, unknown>).IS_STAFF;
});

describe('fetchAdminWhoami', () => {
  it('정상 owner 응답', async () => {
    global.fetch = vi.fn(async () => ({
      json: async () => ({ ok: true, role: 'owner', owner: true, manager: true, userId: 1 }),
    } as Response)) as typeof fetch;
    const r = await fetchAdminWhoami('TEST');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.role).toBe('owner');
      expect(r.owner).toBe(true);
    }
  });

  it('비인증 응답', async () => {
    global.fetch = vi.fn(async () => ({
      json: async () => ({ ok: false, role: null, owner: false, manager: false, userId: null }),
    } as Response)) as typeof fetch;
    const r = await fetchAdminWhoami();
    expect(r.ok).toBe(false);
  });

  it('네트워크 에러 → unauthorized fallback', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); }) as typeof fetch;
    const r = await fetchAdminWhoami('K');
    expect(r.ok).toBe(false);
  });
});

describe('storage helpers', () => {
  it('setStoredKey + getStoredKey', () => {
    setStoredKey('MY_KEY');
    expect(getStoredKey()).toBe('MY_KEY');
  });

  it('clearStoredKey', () => {
    setStoredKey('K');
    clearStoredKey();
    expect(getStoredKey()).toBe('');
  });

  it('sessionStorage 비어있음 → 빈 문자열', () => {
    expect(getStoredKey()).toBe('');
  });
});

describe('isOwnerSession / isManagerSession / isStaffSession', () => {
  it('아무 글로벌 없음 → 모두 false', () => {
    expect(isOwnerSession()).toBe(false);
    expect(isManagerSession()).toBe(false);
    expect(isStaffSession()).toBe(false);
  });

  it('IS_OWNER + KEY → owner true', () => {
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    expect(isOwnerSession()).toBe(true);
  });

  it('IS_OWNER 만 (KEY 없음) → false', () => {
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    expect(isOwnerSession()).toBe(false);
  });

  it('IS_MANAGER + KEY → manager true', () => {
    (globalThis as Record<string, unknown>).IS_MANAGER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    expect(isManagerSession()).toBe(true);
  });

  it('IS_STAFF + KEY → staff true', () => {
    (globalThis as Record<string, unknown>).IS_STAFF = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    expect(isStaffSession()).toBe(true);
  });
});
