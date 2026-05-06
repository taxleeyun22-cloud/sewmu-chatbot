/**
 * Phase #3 적용 확장 (2-2, 2026-05-06): memo-filter 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeMemoType,
  matchCdCategory,
  matchTag,
  sortMemos,
  filterMemos,
  NEW_MEMO_TYPES,
  ALLOWED_MEMO_TYPES,
} from './memo-filter';
import type { Memo } from '@/features/memos/state';

function mkMemo(overrides: Partial<Memo> = {}): Memo {
  return {
    id: 1,
    room_id: null,
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

describe('상수', () => {
  it('NEW_MEMO_TYPES = 3종', () => {
    expect(NEW_MEMO_TYPES).toEqual(['할 일', '완료', '거래처 정보']);
  });

  it('ALLOWED_MEMO_TYPES 신규 3 + 구 6 = 10종', () => {
    expect(ALLOWED_MEMO_TYPES.length).toBe(10);
    expect(ALLOWED_MEMO_TYPES).toContain('할 일');
    expect(ALLOWED_MEMO_TYPES).toContain('확인필요');
    expect(ALLOWED_MEMO_TYPES).toContain('완료처리');
  });
});

describe('normalizeMemoType', () => {
  it('신규 3종 그대로', () => {
    expect(normalizeMemoType('할 일')).toBe('할 일');
    expect(normalizeMemoType('완료')).toBe('완료');
    expect(normalizeMemoType('거래처 정보')).toBe('거래처 정보');
  });

  it('구버전 → 신규 매핑', () => {
    expect(normalizeMemoType('확인필요')).toBe('할 일');
    expect(normalizeMemoType('고객요청')).toBe('할 일');
    expect(normalizeMemoType('완료처리')).toBe('완료');
    expect(normalizeMemoType('사실메모')).toBe('거래처 정보');
    expect(normalizeMemoType('주의사항')).toBe('거래처 정보');
    expect(normalizeMemoType('참고')).toBe('거래처 정보');
  });

  it('null/빈 → 거래처 정보 (default)', () => {
    expect(normalizeMemoType(null)).toBe('거래처 정보');
    expect(normalizeMemoType('')).toBe('거래처 정보');
    expect(normalizeMemoType('알수없음')).toBe('거래처 정보');
  });
});

describe('matchCdCategory', () => {
  it('all → 항상 true', () => {
    expect(matchCdCategory(mkMemo(), 'all')).toBe(true);
    expect(matchCdCategory(mkMemo({ memo_type: '완료' }), 'all')).toBe(true);
  });

  it('신규 3종 그룹 매칭', () => {
    expect(matchCdCategory(mkMemo({ memo_type: '할 일' }), '할 일')).toBe(true);
    expect(matchCdCategory(mkMemo({ memo_type: '확인필요' }), '할 일')).toBe(true);
    expect(matchCdCategory(mkMemo({ memo_type: '완료' }), '할 일')).toBe(false);
    expect(matchCdCategory(mkMemo({ memo_type: '완료처리' }), '완료')).toBe(true);
  });

  it('전화/문서/이슈/약속/일반 → category 필드 매칭', () => {
    expect(matchCdCategory(mkMemo({ category: '전화' }), '전화')).toBe(true);
    expect(matchCdCategory(mkMemo({ category: '문서' }), '문서')).toBe(true);
    expect(matchCdCategory(mkMemo({ category: '전화' }), '문서')).toBe(false);
    expect(matchCdCategory(mkMemo({ category: null }), '전화')).toBe(false);
  });
});

describe('matchTag', () => {
  it('null tag → 항상 true', () => {
    expect(matchTag(mkMemo({ tags: [] }), null)).toBe(true);
    expect(matchTag(mkMemo({ tags: ['부가세'] }), null)).toBe(true);
  });

  it('tag 포함 여부', () => {
    expect(matchTag(mkMemo({ tags: ['부가세', '5월'] }), '부가세')).toBe(true);
    expect(matchTag(mkMemo({ tags: ['부가세'] }), '5월')).toBe(false);
  });

  it('tags 비배열 → false', () => {
    expect(matchTag(mkMemo({ tags: null as unknown as string[] }), '부가세')).toBe(false);
  });
});

describe('sortMemos', () => {
  const a = mkMemo({ id: 1, created_at: '2026-05-01 10:00:00', due_date: '2026-05-10', memo_type: '할 일' });
  const b = mkMemo({ id: 2, created_at: '2026-05-03 10:00:00', due_date: '2026-05-05', memo_type: '완료' });
  const c = mkMemo({ id: 3, created_at: '2026-05-02 10:00:00', due_date: null, memo_type: '거래처 정보' });

  it('recent (default): created_at desc', () => {
    const r = sortMemos([a, b, c]);
    expect(r.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it('due: due_date asc, null 끝', () => {
    const r = sortMemos([a, b, c], 'due');
    expect(r.map((x) => x.id)).toEqual([2, 1, 3]);
  });

  it('type: 할 일 → 완료 → 거래처 정보 → created_at desc', () => {
    const r = sortMemos([a, b, c], 'type');
    expect(r.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it('빈 배열 OK', () => {
    expect(sortMemos([])).toEqual([]);
  });
});

describe('filterMemos (통합)', () => {
  const memos: Memo[] = [
    mkMemo({ id: 1, memo_type: '할 일', tags: ['부가세'], created_at: '2026-05-03' }),
    mkMemo({ id: 2, memo_type: '완료', tags: ['부가세'], created_at: '2026-05-02' }),
    mkMemo({ id: 3, memo_type: '할 일', tags: ['종소세'], created_at: '2026-05-01' }),
  ];

  it('카테고리 + 태그 + 정렬', () => {
    const r = filterMemos(memos, { category: '할 일', tag: '부가세', sort: 'recent' });
    expect(r.map((m) => m.id)).toEqual([1]);
  });

  it('all + 부가세 태그', () => {
    const r = filterMemos(memos, { category: 'all', tag: '부가세' });
    expect(r.map((m) => m.id).sort()).toEqual([1, 2]);
  });

  it('default opts (all + null tag + recent)', () => {
    const r = filterMemos(memos);
    expect(r.length).toBe(3);
    expect(r[0].id).toBe(1);
  });
});
