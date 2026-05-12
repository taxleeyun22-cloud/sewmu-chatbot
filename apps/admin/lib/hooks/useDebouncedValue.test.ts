/**
 * Phase 10 cleanup (2026-05-12): useDebouncedValue 단위 테스트.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('초기값 즉시 반환', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 250));
    expect(result.current).toBe('hello');
  });

  it('값 바뀜 → delay 만큼 대기 후 반영', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: 'a' },
    });
    expect(result.current).toBe('a');

    rerender({ v: 'b' });
    expect(result.current).toBe('a'); /* 아직 반영 X */

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('빠르게 연속 변경 시 마지막만 반영 (debounce 핵심)', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: '' },
    });

    rerender({ v: 'a' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ v: 'ab' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ v: 'abc' });

    /* 아직 250ms 안 지났음 */
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe('abc');
  });

  it('delay 0 → 즉시 (useEffect 기준 next tick)', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 0), {
      initialProps: { v: 'x' },
    });
    rerender({ v: 'y' });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe('y');
  });
});
