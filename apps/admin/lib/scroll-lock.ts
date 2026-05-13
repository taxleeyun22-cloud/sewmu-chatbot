/**
 * Phase 15 audit fix (2026-05-12): nested modal scroll-lock 안전.
 *
 * 이전 사고: ConfirmDialog 와 Dialog 둘 다 `document.body.style.overflow = 'hidden'`
 * 직접 set/clear. 둘 다 동시 open 후 안쪽 닫히면 바깥의 lock 해제됨 → scroll-jail 깨짐.
 *
 * 해결: reference counter — 누가 lock 했는지 카운트.
 * 모든 모달이 acquire/release 호출. 카운트 0 일 때만 실제 overflow 복원.
 *
 * 사용:
 *   useEffect(() => {
 *     if (!open) return;
 *     const release = acquireScrollLock();
 *     return release;
 *   }, [open]);
 */

let lockCount = 0;
let originalOverflow: string | null = null;

/**
 * scroll lock 획득. 호출자는 unmount/cleanup 시 반환된 release 함수 호출.
 */
export function acquireScrollLock(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (lockCount === 0) {
    /* 첫 lock — 원본 overflow 값 저장 후 hidden */
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount++;
  let released = false;
  return () => {
    if (released) return; // idempotent (double-cleanup 방어)
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      /* 마지막 lock 해제 — 원본 값 복원 */
      document.body.style.overflow = originalOverflow ?? '';
      originalOverflow = null;
    }
  };
}

/* 테스트 전용 — counter 초기화 */
export function _resetScrollLockForTest(): void {
  lockCount = 0;
  originalOverflow = null;
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
  }
}
