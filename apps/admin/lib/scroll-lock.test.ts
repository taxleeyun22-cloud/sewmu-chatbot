/**
 * Phase 15 audit fix (2026-05-12): nested modal scroll-lock 단위 테스트.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { acquireScrollLock, _resetScrollLockForTest } from './scroll-lock';

describe('acquireScrollLock', () => {
  beforeEach(() => {
    _resetScrollLockForTest();
  });

  it('첫 acquire → body.style.overflow="hidden"', () => {
    acquireScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('release → overflow 복원', () => {
    const release = acquireScrollLock();
    release();
    expect(document.body.style.overflow).toBe('');
  });

  it('nested (2개 stack) → 안쪽 release 해도 lock 유지', () => {
    const r1 = acquireScrollLock();
    const r2 = acquireScrollLock();
    expect(document.body.style.overflow).toBe('hidden');

    /* 안쪽 dialog 닫힘 (r2 release) — body lock 유지 (바깥 r1 살아있음) */
    r2();
    expect(document.body.style.overflow).toBe('hidden');

    /* 바깥 dialog 닫힘 (r1 release) — 비로소 복원 */
    r1();
    expect(document.body.style.overflow).toBe('');
  });

  it('release 중복 호출 — idempotent (counter 음수 안 됨)', () => {
    const r = acquireScrollLock();
    r();
    r(); // double-cleanup
    /* 다시 acquire 해도 정상 작동 (counter 음수 X) */
    acquireScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('원래 overflow 값 보존 (acquire 전이 hidden 아니어도 복원)', () => {
    document.body.style.overflow = 'auto';
    const r = acquireScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
    r();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('3개 stack → 모두 닫혀야 복원', () => {
    const releases = [acquireScrollLock(), acquireScrollLock(), acquireScrollLock()];
    releases.forEach((r, i) => {
      r();
      if (i < 2) expect(document.body.style.overflow).toBe('hidden');
      else expect(document.body.style.overflow).toBe('');
    });
  });
});
