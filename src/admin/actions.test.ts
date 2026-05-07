/**
 * Phase #3 적용 확장 (2026-05-06): admin/actions wrapper 단위 테스트.
 *
 * admin.js 가 로드 안 된 환경에서도 wrapper 가 안전하게 fallback.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  openCustomerDashboardSafe,
  openRoomSafe,
  navigateToTab,
  getCurrentAdminRole,
  getCurrentKey,
  getCurrentAdminContext,
} from './actions';

beforeEach(() => {
  /* 글로벌 정리 */
  delete (globalThis as Record<string, unknown>).KEY;
  delete (globalThis as Record<string, unknown>).IS_OWNER;
  delete (globalThis as Record<string, unknown>).IS_MANAGER;
  delete (globalThis as Record<string, unknown>).IS_STAFF;
  delete (globalThis as Record<string, unknown>)._cdCurrentUserId;
  delete (globalThis as Record<string, unknown>).currentRoomId;
  delete (globalThis as Record<string, unknown>).openCustomerDashboard;
  delete (globalThis as Record<string, unknown>).openRoom;
  delete (globalThis as Record<string, unknown>).tab;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('openCustomerDashboardSafe', () => {
  it('함수 미정의 → false 반환', async () => {
    const r = await openCustomerDashboardSafe(64);
    expect(r).toBe(false);
  });

  it('함수 정의됨 → 호출 + true', async () => {
    const fn = vi.fn(async () => undefined);
    (globalThis as Record<string, unknown>).openCustomerDashboard = fn;
    const r = await openCustomerDashboardSafe(64);
    expect(r).toBe(true);
    expect(fn).toHaveBeenCalledWith(64);
  });
});

describe('openRoomSafe', () => {
  it('함수 미정의 → false', async () => {
    const r = await openRoomSafe('R001');
    expect(r).toBe(false);
  });

  it('함수 정의됨 → 호출', async () => {
    const fn = vi.fn(async () => undefined);
    (globalThis as Record<string, unknown>).openRoom = fn;
    const r = await openRoomSafe('R001');
    expect(r).toBe(true);
    expect(fn).toHaveBeenCalledWith('R001');
  });
});

describe('navigateToTab', () => {
  it('tab 미정의 → false', () => {
    expect(navigateToTab('users')).toBe(false);
  });

  it('tab 정의됨 → 호출', () => {
    const fn = vi.fn();
    (globalThis as Record<string, unknown>).tab = fn;
    expect(navigateToTab('docs')).toBe(true);
    expect(fn).toHaveBeenCalledWith('docs');
  });
});

describe('getCurrentAdminRole', () => {
  it('아무 글로벌 없음 → unknown', () => {
    const r = getCurrentAdminRole();
    expect(r.level).toBe('unknown');
    expect(r.owner).toBe(false);
    expect(r.manager).toBe(false);
    expect(r.staff).toBe(false);
  });

  it('IS_OWNER=true → owner', () => {
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    const r = getCurrentAdminRole();
    expect(r.level).toBe('owner');
    expect(r.owner).toBe(true);
  });

  it('IS_MANAGER=true (IS_OWNER 없음) → manager', () => {
    (globalThis as Record<string, unknown>).IS_MANAGER = true;
    const r = getCurrentAdminRole();
    expect(r.level).toBe('manager');
  });

  it('IS_STAFF=true 만 → staff', () => {
    (globalThis as Record<string, unknown>).IS_STAFF = true;
    const r = getCurrentAdminRole();
    expect(r.level).toBe('staff');
  });

  it('IS_OWNER + IS_MANAGER 둘 다 → owner 우선', () => {
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    (globalThis as Record<string, unknown>).IS_MANAGER = true;
    const r = getCurrentAdminRole();
    expect(r.level).toBe('owner');
  });
});

describe('getCurrentKey', () => {
  it('KEY 미정의 → 빈 문자열', () => {
    expect(getCurrentKey()).toBe('');
  });

  it('KEY 정의됨 → 그 값', () => {
    (globalThis as Record<string, unknown>).KEY = 'TEST_KEY';
    expect(getCurrentKey()).toBe('TEST_KEY');
  });
});

describe('getCurrentAdminContext', () => {
  it('아무 글로벌 없음 → null 들', () => {
    const r = getCurrentAdminContext();
    expect(r.userId).toBeNull();
    expect(r.roomId).toBeNull();
  });

  it('_cdCurrentUserId + currentRoomId set → 그 값', () => {
    (globalThis as Record<string, unknown>)._cdCurrentUserId = 64;
    (globalThis as Record<string, unknown>).currentRoomId = 'Z2HBV2';
    const r = getCurrentAdminContext();
    expect(r.userId).toBe(64);
    expect(r.roomId).toBe('Z2HBV2');
  });
});
