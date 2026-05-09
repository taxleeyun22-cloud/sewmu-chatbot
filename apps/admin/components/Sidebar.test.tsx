/**
 * Phase Next-Day25 (2026-05-09): Sidebar badge logic + count rendering 테스트.
 */
import { describe, it, expect } from 'vitest';
import { badgeClass } from './sidebar-badge';

describe('badgeClass — 카운트 배지 색깔 매핑', () => {
  it('hides badge when count is 0', () => {
    expect(badgeClass('pendingUsers', 0)).toBe('hidden');
    expect(badgeClass('pendingDocs', 0)).toBe('hidden');
    expect(badgeClass(undefined, 0)).toBe('hidden');
  });

  it('urgent (red) for pendingUsers / urgentTodos / reviewPending', () => {
    expect(badgeClass('pendingUsers', 5)).toContain('red');
    expect(badgeClass('urgentTodos', 1)).toContain('red');
    expect(badgeClass('reviewPending', 2)).toContain('red');
  });

  it('warn (yellow) for pendingDocs / filingsInProgress', () => {
    expect(badgeClass('pendingDocs', 3)).toContain('yellow');
    expect(badgeClass('filingsInProgress', 1)).toContain('yellow');
  });

  it('neutral (gray) for activeRooms / etc', () => {
    expect(badgeClass('activeRooms', 7)).toContain('gray');
    expect(badgeClass('approvedClients', 100)).toContain('gray');
  });

  it('undefined countKey → gray (default)', () => {
    expect(badgeClass(undefined, 1)).toContain('gray');
  });
});
