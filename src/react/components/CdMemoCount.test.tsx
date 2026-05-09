/**
 * Phase 3.3.A (2026-05-08): CdMemoCount 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CdMemoCount } from './CdMemoCount';
import { $cdMemoCache, type Memo } from '../../features/memos/state';

beforeEach(() => {
  $cdMemoCache.set([]);
});

afterEach(() => {
  cleanup();
});

const makeMemo = (id: number): Memo => ({
  id,
  room_id: null,
  target_user_id: 1,
  target_business_id: null,
  author_user_id: 1,
  author_name: 'admin',
  memo_type: '일반',
  content: `메모 ${id}`,
  due_date: null,
  category: null,
  tags: [],
  attachments: [],
  created_at: '2026-05-08 10:00:00',
});

describe('CdMemoCount', () => {
  it('초기값 0', () => {
    const { container } = render(<CdMemoCount />);
    expect(container.textContent).toBe('0');
  });

  it('메모 1개 → 1', () => {
    const { container } = render(<CdMemoCount />);
    act(() => $cdMemoCache.set([makeMemo(1)]));
    expect(container.textContent).toBe('1');
  });

  it('메모 5개 → 5', () => {
    const { container } = render(<CdMemoCount />);
    act(() => $cdMemoCache.set([1, 2, 3, 4, 5].map(makeMemo)));
    expect(container.textContent).toBe('5');
  });

  it('store 변경 → 즉시 갱신', () => {
    const { container } = render(<CdMemoCount />);
    act(() => $cdMemoCache.set([makeMemo(1), makeMemo(2)]));
    expect(container.textContent).toBe('2');
    act(() => $cdMemoCache.set([]));
    expect(container.textContent).toBe('0');
  });
});
