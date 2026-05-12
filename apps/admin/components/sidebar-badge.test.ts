/**
 * Phase 11 cleanup (2026-05-12): sidebar badge 색 매핑 단위 테스트.
 * 30초 만에 쓸 수 있는 순수 함수 테스트 — Google 엔지니어 audit "0 component tests" 지적 fix.
 */
import { describe, it, expect } from 'vitest';
import { badgeClass, type CountKey } from './sidebar-badge';

describe('badgeClass', () => {
  it('count=0 → hidden', () => {
    expect(badgeClass('pendingUsers', 0)).toBe('hidden');
    expect(badgeClass('businesses', 0)).toBe('hidden');
    expect(badgeClass(undefined, 0)).toBe('hidden');
  });

  it('urgent keys (pendingUsers/urgentTodos/reviewPending/errorLogs) → 빨강', () => {
    const urgent: CountKey[] = ['pendingUsers', 'urgentTodos', 'reviewPending', 'errorLogs'];
    for (const k of urgent) {
      expect(badgeClass(k, 1)).toBe('bg-red-100 text-red-700');
    }
  });

  it('warn keys (pendingDocs/filingsInProgress) → 노랑', () => {
    expect(badgeClass('pendingDocs', 3)).toBe('bg-yellow-100 text-yellow-700');
    expect(badgeClass('filingsInProgress', 1)).toBe('bg-yellow-100 text-yellow-700');
  });

  it('normal keys (businesses/memosTotal/...) → 회색', () => {
    const normal: CountKey[] = [
      'approvedClients',
      'rejectedUsers',
      'terminatedUsers',
      'adminUsers',
      'businesses',
      'memosTotal',
      'trash',
      'activeRooms',
      'unreadMessages',
    ];
    for (const k of normal) {
      expect(badgeClass(k, 5)).toBe('bg-gray-200 text-gray-700');
    }
  });

  it('undefined key + count > 0 → 회색 (default)', () => {
    expect(badgeClass(undefined, 5)).toBe('bg-gray-200 text-gray-700');
  });
});
