/**
 * Phase #3 Phase 3-1: memos-room 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeRoomMemoType,
  computeMemoCounts,
  filterRoomMemos,
  dDayLabel,
  fetchRoomMemos,
} from './memos-room';
import type { Memo } from '@/features/memos/state';

function mk(overrides: Partial<Memo> = {}): Memo {
  return {
    id: 1,
    room_id: 'R001',
    target_user_id: null,
    target_business_id: null,
    author_user_id: 1,
    author_name: '사장님',
    memo_type: '할 일',
    content: '테스트',
    due_date: null,
    category: null,
    tags: [],
    attachments: [],
    created_at: '2026-05-06 12:00:00',
    ...overrides,
  };
}

describe('normalizeRoomMemoType', () => {
  it('신규 3종 그대로', () => {
    expect(normalizeRoomMemoType('할 일')).toBe('할 일');
    expect(normalizeRoomMemoType('완료')).toBe('완료');
    expect(normalizeRoomMemoType('거래처 정보')).toBe('거래처 정보');
  });

  it('구버전 매핑', () => {
    expect(normalizeRoomMemoType('확인필요')).toBe('할 일');
    expect(normalizeRoomMemoType('고객요청')).toBe('할 일');
    expect(normalizeRoomMemoType('완료처리')).toBe('완료');
    expect(normalizeRoomMemoType('주의사항')).toBe('거래처 정보');
    expect(normalizeRoomMemoType('사실메모')).toBe('거래처 정보');
  });

  it('null/빈 → 거래처 정보 (default)', () => {
    expect(normalizeRoomMemoType(null)).toBe('거래처 정보');
    expect(normalizeRoomMemoType('')).toBe('거래처 정보');
  });
});

describe('computeMemoCounts', () => {
  it('빈 배열 → 0 / 0 / 0 / 0', () => {
    const c = computeMemoCounts([]);
    expect(c).toEqual({ '할 일': 0, '거래처 정보': 0, '완료': 0, total: 0 });
  });

  it('타입 별 카운트', () => {
    const memos = [
      mk({ memo_type: '할 일' }),
      mk({ memo_type: '확인필요' }),  // → 할 일
      mk({ memo_type: '완료' }),
      mk({ memo_type: '주의사항' }),  // → 거래처 정보
    ];
    const c = computeMemoCounts(memos);
    expect(c['할 일']).toBe(2);
    expect(c['완료']).toBe(1);
    expect(c['거래처 정보']).toBe(1);
    expect(c.total).toBe(4);
  });
});

describe('filterRoomMemos', () => {
  const memos = [
    mk({ id: 1, memo_type: '할 일' }),
    mk({ id: 2, memo_type: '완료' }),
    mk({ id: 3, memo_type: '거래처 정보' }),
    mk({ id: 4, memo_type: '확인필요' }),  // → 할 일
  ];

  it('all → 전부', () => {
    expect(filterRoomMemos(memos, 'all')).toHaveLength(4);
  });

  it('todo → 할 일 + 확인필요', () => {
    const r = filterRoomMemos(memos, 'todo');
    expect(r.map((m) => m.id).sort()).toEqual([1, 4]);
  });

  it('done → 완료', () => {
    expect(filterRoomMemos(memos, 'done').map((m) => m.id)).toEqual([2]);
  });

  it('ref → 거래처 정보', () => {
    expect(filterRoomMemos(memos, 'ref').map((m) => m.id)).toEqual([3]);
  });
});

describe('dDayLabel', () => {
  /* 2026-05-06 12:00:00 KST = 2026-05-06 03:00:00 UTC */
  const NOW_MS = Date.UTC(2026, 4, 6, 3, 0, 0);

  it('null/빈 → null', () => {
    expect(dDayLabel(null)).toBeNull();
    expect(dDayLabel('')).toBeNull();
  });

  it('잘못된 형식 → null', () => {
    expect(dDayLabel('2026-5-6')).toBeNull();
    expect(dDayLabel('not-a-date')).toBeNull();
  });

  it('오늘 → D-Day', () => {
    expect(dDayLabel('2026-05-06', NOW_MS)).toBe('D-Day');
  });

  it('내일 → D-1', () => {
    expect(dDayLabel('2026-05-07', NOW_MS)).toBe('D-1');
  });

  it('3일 후 → D-3', () => {
    expect(dDayLabel('2026-05-09', NOW_MS)).toBe('D-3');
  });

  it('어제 → D+1', () => {
    expect(dDayLabel('2026-05-05', NOW_MS)).toBe('D+1');
  });
});

describe('fetchRoomMemos', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).KEY = 'TEST_KEY';
  });

  it('scope=room_full + room_id', async () => {
    let lastUrl = '';
    global.fetch = vi.fn(async (url: URL | RequestInfo) => {
      lastUrl = String(url);
      return { json: async () => ({ memos: [mk()] }) } as Response;
    }) as typeof fetch;
    const r = await fetchRoomMemos('R001');
    expect(r.ok).toBe(true);
    expect(lastUrl).toContain('scope=room_full');
    expect(lastUrl).toContain('room_id=R001');
    if (r.ok) expect(r.memos).toHaveLength(1);
  });

  it('error 응답', async () => {
    global.fetch = vi.fn(async () => ({
      json: async () => ({ error: 'unauth' }),
    } as Response)) as typeof fetch;
    const r = await fetchRoomMemos('R001');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unauth');
  });
});
