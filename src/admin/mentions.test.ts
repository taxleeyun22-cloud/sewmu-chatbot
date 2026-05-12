/**
 * Phase Next-Day29 (2026-05-12): mentions module 단위 테스트.
 */
import { describe, it, expect } from 'vitest';
import {
  mentionify,
  findMentionToken,
  filterMentionCandidates,
  applyMentionPick,
  handleMentionKey,
  createMentionState,
  type MentionStaff,
} from './mentions';

const STAFF: MentionStaff[] = [
  { id: 1, name: '이재윤', is_admin: 1 },
  { id: 2, name: '박승호' },
  { id: 3, name: '박철수' },
  { id: 4, name: '김민수', is_admin: 1 },
];

describe('mentionify (@ → span)', () => {
  it('기본 @ 변환 — 파란색 span', () => {
    const out = mentionify('hello @홍길동 world');
    expect(out).toContain('data-mention="홍길동"');
    expect(out).toContain('color:#3182f6');
  });

  it('본인 @ — 노란 강조', () => {
    const out = mentionify('hi @이재윤', '이재윤');
    expect(out).toContain('background:#fef08a');
    expect(out).toContain('color:#854d0e');
  });

  it('본인 + "대표" 접미사도 매칭', () => {
    const out = mentionify('@이재윤대표 보세요', '이재윤');
    expect(out).toContain('background:#fef08a');
  });

  it('타인은 노란색 안 됨', () => {
    const out = mentionify('@박승호 안녕', '이재윤');
    expect(out).not.toContain('background:#fef08a');
    expect(out).toContain('color:#3182f6');
  });

  it('빈 문자열 그대로', () => {
    expect(mentionify('')).toBe('');
  });

  it('@ 없는 문장 그대로', () => {
    expect(mentionify('hello world')).toBe('hello world');
  });

  it('20자까지만 매칭 (regex limit)', () => {
    const longName = 'a'.repeat(25);
    const out = mentionify(`hi @${longName}`);
    /* regex {1,20} 이라 앞 20글자만 매칭 */
    expect(out).toContain('data-mention="aaaaaaaaaaaaaaaaaaaa"');
    /* 21번째 a 부터는 span 밖에 */
    expect(out).toMatch(/<\/span>aaaaa$/);
  });

  it('defensive escape — 캡처 그룹에 특수문자가 들어와도 안전', () => {
    /* regex char class 가 좁아서 실제로는 < > " ' 매칭 안 되지만, 향후 완화 대비 escape */
    /* underscore + dot 은 매칭됨 — XSS 위험은 없음 */
    const out = mentionify('hi @user_name.ok');
    expect(out).toContain('data-mention="user_name.ok"');
    /* 데이터 속성 안에 raw " 가 없어야 (escape 됐어야) */
    const dataMatch = out.match(/data-mention="([^"]*)"/);
    expect(dataMatch?.[1]).toBe('user_name.ok');
  });
});

describe('findMentionToken (caret 앞 @token 추출)', () => {
  it('단순 @abc 인식', () => {
    const r = findMentionToken('hi @abc', 7);
    expect(r).toEqual({ start: 3, query: 'abc' });
  });

  it('공백 없으면 인식', () => {
    const r = findMentionToken('@박승', 3);
    expect(r).toEqual({ start: 0, query: '박승' });
  });

  it('@ 없으면 null', () => {
    expect(findMentionToken('hello world', 11)).toBeNull();
  });

  it('caret 가 단어 중간이면 token 은 caret 까지만', () => {
    const r = findMentionToken('@홍길동입니다', 3);
    expect(r).toEqual({ start: 0, query: '홍길' });
  });

  it('21자 초과 query → null', () => {
    const long = '@' + 'a'.repeat(25);
    expect(findMentionToken(long, long.length)).toBeNull();
  });
});

describe('filterMentionCandidates', () => {
  it('빈 query → 전체 (max 8)', () => {
    expect(filterMentionCandidates(STAFF, '')).toHaveLength(4);
  });

  it('startsWith 매칭', () => {
    const out = filterMentionCandidates(STAFF, '박');
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.name)).toEqual(['박승호', '박철수']);
  });

  it('대소문자 무시', () => {
    const out = filterMentionCandidates([{ id: 1, name: 'Admin' }], 'admin');
    expect(out).toHaveLength(1);
  });

  it('max 제한', () => {
    const many: MentionStaff[] = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `user${i}` }));
    expect(filterMentionCandidates(many, '', 5)).toHaveLength(5);
  });

  it('매칭 안 되면 빈 배열', () => {
    expect(filterMentionCandidates(STAFF, 'XYZ_NOMATCH')).toEqual([]);
  });
});

describe('applyMentionPick', () => {
  it('value 안 @token 자리에 picked name + 공백 삽입', () => {
    const state = createMentionState();
    state.start = 4; /* "hi  @abc" 의 @ 위치 */
    const out = applyMentionPick('hi  @abc trailing', 8, state, { id: 1, name: '박승호' });
    expect(out.value).toBe('hi  @박승호  trailing');
    expect(out.caret).toBe('hi  @박승호 '.length);
  });

  it('value 시작 @ 도 정상', () => {
    const state = createMentionState();
    state.start = 0;
    const out = applyMentionPick('@a more', 2, state, { id: 1, name: '이재윤' });
    expect(out.value).toBe('@이재윤  more');
  });
});

describe('handleMentionKey', () => {
  it('inactive 시 consume 안 함', () => {
    const state = createMentionState();
    expect(handleMentionKey(state, 'ArrowDown').consume).toBe(false);
  });

  it('ArrowDown → selIdx +1 (cap 매칭 수-1)', () => {
    const state = createMentionState();
    state.active = true;
    state.matches = STAFF.slice(0, 3);
    state.selIdx = 0;
    expect(handleMentionKey(state, 'ArrowDown').action).toBe('down');
    expect(state.selIdx).toBe(1);
    handleMentionKey(state, 'ArrowDown');
    handleMentionKey(state, 'ArrowDown');
    handleMentionKey(state, 'ArrowDown');
    /* 3개라 max=2 */
    expect(state.selIdx).toBe(2);
  });

  it('ArrowUp 최소 0', () => {
    const state = createMentionState();
    state.active = true;
    state.matches = STAFF;
    state.selIdx = 0;
    expect(handleMentionKey(state, 'ArrowUp').action).toBe('up');
    expect(state.selIdx).toBe(0);
  });

  it('Enter → pick', () => {
    const state = createMentionState();
    state.active = true;
    state.matches = STAFF;
    expect(handleMentionKey(state, 'Enter').action).toBe('pick');
  });

  it('Tab → pick', () => {
    const state = createMentionState();
    state.active = true;
    state.matches = STAFF;
    expect(handleMentionKey(state, 'Tab').action).toBe('pick');
  });

  it('Escape → close + state reset', () => {
    const state = createMentionState();
    state.active = true;
    state.matches = STAFF;
    state.selIdx = 2;
    state.start = 5;
    const r = handleMentionKey(state, 'Escape');
    expect(r.action).toBe('close');
    expect(state.active).toBe(false);
    expect(state.matches).toEqual([]);
    expect(state.selIdx).toBe(0);
    expect(state.start).toBe(-1);
  });

  it('알 수 없는 키는 consume X', () => {
    const state = createMentionState();
    state.active = true;
    state.matches = STAFF;
    expect(handleMentionKey(state, 'a').consume).toBe(false);
  });
});
