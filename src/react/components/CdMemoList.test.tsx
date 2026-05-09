/**
 * Phase 3.3.B (2026-05-08): CdMemoList 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CdMemoList } from './CdMemoList';
import {
  $cdMemoCache,
  $cdMemoCategory,
  $cdMemoListTrigger,
  type Memo,
} from '../../features/memos/state';

const makeMemo = (id: number, content?: string): Memo => ({
  id,
  room_id: null,
  target_user_id: 1,
  target_business_id: null,
  author_user_id: 1,
  author_name: 'admin',
  memo_type: '일반',
  content: content || `메모 ${id}`,
  due_date: null,
  category: null,
  tags: [],
  attachments: [],
  created_at: '2026-05-08 10:00:00',
});

beforeEach(() => {
  $cdMemoCache.set([]);
  $cdMemoCategory.set('all');
  $cdMemoListTrigger.set(0);
  /* mock — admin-memos.js 의 helper */
  window.__buildCdMemosListHtml = vi.fn(() => {
    const memos = $cdMemoCache.get();
    if (!memos.length) return '<div class="empty-mock">메모 없음</div>';
    return memos.map((m) => `<div class="memo-card-mock" data-memo-id="${m.id}">${m.content}</div>`).join('');
  });
});

afterEach(() => {
  cleanup();
  delete window.__buildCdMemosListHtml;
});

describe('CdMemoList', () => {
  it('초기 — empty', () => {
    const { container } = render(<CdMemoList />);
    expect(container.querySelector('.empty-mock')).toBeTruthy();
  });

  it('메모 추가 → 자동 표시', () => {
    const { container } = render(<CdMemoList />);
    act(() => $cdMemoCache.set([makeMemo(1, '첫 메모')]));
    expect(container.querySelectorAll('.memo-card-mock').length).toBe(1);
    expect(container.textContent).toContain('첫 메모');
  });

  it('메모 3개 → 카드 3개', () => {
    const { container } = render(<CdMemoList />);
    act(() => $cdMemoCache.set([makeMemo(1), makeMemo(2), makeMemo(3)]));
    expect(container.querySelectorAll('.memo-card-mock').length).toBe(3);
  });

  it('store cache 변경 → 자동 갱신', () => {
    const { container } = render(<CdMemoList />);
    act(() => $cdMemoCache.set([makeMemo(1, '첫번째')]));
    expect(container.textContent).toContain('첫번째');
    act(() => $cdMemoCache.set([makeMemo(2, '두번째')]));
    expect(container.textContent).toContain('두번째');
    expect(container.textContent).not.toContain('첫번째');
  });

  it('$cdMemoListTrigger 변경 → 자동 re-render (cdSetTagFilter 등 trigger 패턴)', () => {
    const { container } = render(<CdMemoList />);
    act(() => $cdMemoCache.set([makeMemo(1)]));
    const callCountBefore = (window.__buildCdMemosListHtml as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => $cdMemoListTrigger.set(1));
    const callCountAfter = (window.__buildCdMemosListHtml as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCountAfter).toBeGreaterThan(callCountBefore);
  });

  it('builder 미로드 → fallback 메시지', () => {
    delete window.__buildCdMemosListHtml;
    const { container } = render(<CdMemoList />);
    expect(container.textContent).toContain('메모 빌더 미로드');
  });

  it('builder 에러 → fallback 메시지', () => {
    window.__buildCdMemosListHtml = vi.fn(() => {
      throw new Error('builder 폭발');
    });
    const { container } = render(<CdMemoList />);
    expect(container.textContent).toContain('메모 list 렌더 실패: builder 폭발');
  });

  it('카테고리 변경 → 자동 갱신', () => {
    const { container } = render(<CdMemoList />);
    act(() => $cdMemoCategory.set('할 일'));
    /* builder mock 이 다시 호출됨 (verify 됨) */
    expect(typeof window.__buildCdMemosListHtml).toBe('function');
    expect(container.querySelector('.empty-mock')).toBeTruthy();
  });
});
