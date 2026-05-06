/**
 * Phase #6 + #8 적용 (2026-05-06): nanostores 메모 store 단위 테스트.
 *
 * store 의 set / get / subscribe 패턴 작동 여부 검증.
 * admin-memos.js 가 의존하는 동작을 모의 환경에서 확인.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  $roomMemoCache,
  $memoFilter,
  $cdMemoCache,
  $cdMemoCategory,
  $cdSelectedMemoIds,
  $trashSelectedIds,
} from './state';
import type { Memo } from './state';

beforeEach(() => {
  /* 각 테스트 별 store 초기화 */
  $roomMemoCache.set([]);
  $memoFilter.set('todo');
  $cdMemoCache.set([]);
  $cdMemoCategory.set('all');
  $cdSelectedMemoIds.set({});
  $trashSelectedIds.set({});
});

const SAMPLE_MEMO: Memo = {
  id: 1,
  room_id: 'R001',
  target_user_id: null,
  target_business_id: null,
  author_user_id: 1,
  author_name: '사장님',
  memo_type: '할 일',
  content: '테스트 메모 #부가세',
  due_date: '2026-05-10',
  category: '할 일',
  tags: ['부가세'],
  attachments: [],
  created_at: '2026-05-06 12:00:00',
};

describe('$roomMemoCache (atom)', () => {
  it('초기값 빈 배열', () => {
    expect($roomMemoCache.get()).toEqual([]);
  });

  it('set + get', () => {
    $roomMemoCache.set([SAMPLE_MEMO]);
    expect($roomMemoCache.get()).toHaveLength(1);
    expect($roomMemoCache.get()[0].id).toBe(1);
  });

  it('subscribe 호출됨', () => {
    const cb = vi.fn();
    const unsub = $roomMemoCache.subscribe(cb);
    /* subscribe 시 초기값으로 1번 즉시 호출 */
    expect(cb).toHaveBeenCalledTimes(1);
    $roomMemoCache.set([SAMPLE_MEMO]);
    expect(cb).toHaveBeenCalledTimes(2);
    /* 첫 인자는 새 값 (배열), 두번째는 oldValue */
    const lastCall = cb.mock.lastCall!;
    expect(lastCall[0]).toEqual([SAMPLE_MEMO]);
    unsub();
  });

  it('unsubscribe 후 호출 안 됨', () => {
    const cb = vi.fn();
    const unsub = $roomMemoCache.subscribe(cb);
    unsub();
    cb.mockClear();
    $roomMemoCache.set([SAMPLE_MEMO]);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('$memoFilter (atom)', () => {
  it('초기값 todo', () => {
    expect($memoFilter.get()).toBe('todo');
  });

  it('todo / ref / done / all 전환', () => {
    $memoFilter.set('ref');
    expect($memoFilter.get()).toBe('ref');
    $memoFilter.set('done');
    expect($memoFilter.get()).toBe('done');
    $memoFilter.set('all');
    expect($memoFilter.get()).toBe('all');
  });
});

describe('$cdMemoCache (atom)', () => {
  it('거래처 dashboard 메모 캐시 set', () => {
    $cdMemoCache.set([SAMPLE_MEMO, { ...SAMPLE_MEMO, id: 2 }]);
    expect($cdMemoCache.get()).toHaveLength(2);
  });

  it('subscribe 변경 감지', () => {
    let called = 0;
    const unsub = $cdMemoCache.subscribe(() => { called++; });
    $cdMemoCache.set([SAMPLE_MEMO]);
    $cdMemoCache.set([SAMPLE_MEMO, { ...SAMPLE_MEMO, id: 2 }]);
    expect(called).toBeGreaterThanOrEqual(2);
    unsub();
  });
});

describe('$cdMemoCategory (atom)', () => {
  it('all → 전화 → 할 일 등 카테고리 전환', () => {
    expect($cdMemoCategory.get()).toBe('all');
    $cdMemoCategory.set('전화');
    expect($cdMemoCategory.get()).toBe('전화');
    $cdMemoCategory.set('할 일');
    expect($cdMemoCategory.get()).toBe('할 일');
  });
});

describe('$cdSelectedMemoIds (map)', () => {
  it('초기값 빈 객체', () => {
    expect($cdSelectedMemoIds.get()).toEqual({});
  });

  it('setKey 로 단일 ID 추가', () => {
    $cdSelectedMemoIds.setKey(1, true);
    $cdSelectedMemoIds.setKey(5, true);
    const state = $cdSelectedMemoIds.get();
    expect(state[1]).toBe(true);
    expect(state[5]).toBe(true);
    expect(Object.keys(state)).toHaveLength(2);
  });

  it('setKey 로 ID 제거 (false)', () => {
    $cdSelectedMemoIds.setKey(1, true);
    $cdSelectedMemoIds.setKey(2, true);
    $cdSelectedMemoIds.setKey(1, false);
    expect($cdSelectedMemoIds.get()[1]).toBe(false);
    expect($cdSelectedMemoIds.get()[2]).toBe(true);
  });

  it('set 으로 통째 교체', () => {
    $cdSelectedMemoIds.set({ 10: true, 20: true });
    expect(Object.keys($cdSelectedMemoIds.get())).toHaveLength(2);
  });
});

describe('$trashSelectedIds (map)', () => {
  it('휴지통 일괄 선택 패턴', () => {
    $trashSelectedIds.set({ 1: true, 2: true, 3: true });
    expect(Object.keys($trashSelectedIds.get())).toHaveLength(3);
    /* 일괄 해제 = 빈 객체 */
    $trashSelectedIds.set({});
    expect($trashSelectedIds.get()).toEqual({});
  });
});

describe('cross-store 동시 변경 (admin-memos.js _syncMemoStore 시나리오)', () => {
  it('cdMemoCache + cdMemoCategory + cdSelectedMemoIds 동시 변경 → 각 store subscribe 별도 호출', () => {
    const cbCache = vi.fn();
    const cbCategory = vi.fn();
    const cbSelection = vi.fn();
    const u1 = $cdMemoCache.subscribe(cbCache);
    const u2 = $cdMemoCategory.subscribe(cbCategory);
    const u3 = $cdSelectedMemoIds.subscribe(cbSelection);
    /* subscribe 시 초기값으로 1회 호출 */
    cbCache.mockClear();
    cbCategory.mockClear();
    cbSelection.mockClear();

    /* _syncMemoStore 시나리오 */
    $cdMemoCache.set([SAMPLE_MEMO]);
    $cdMemoCategory.set('전화');
    $cdSelectedMemoIds.set({ 1: true });

    expect(cbCache).toHaveBeenCalled();
    expect(cbCategory).toHaveBeenCalled();
    expect(cbSelection).toHaveBeenCalled();

    u1(); u2(); u3();
  });
});
