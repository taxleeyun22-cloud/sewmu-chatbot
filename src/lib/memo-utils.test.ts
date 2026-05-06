/**
 * Phase #8 메타: memo-utils 단위 테스트
 * 실행: npm test
 */

import { describe, it, expect } from 'vitest';
import { extractTags, normalizeTags, kst, timingSafeEqual } from './memo-utils';

describe('extractTags', () => {
  it('빈 입력은 빈 배열 반환', () => {
    expect(extractTags('')).toEqual([]);
    expect(extractTags(null)).toEqual([]);
    expect(extractTags(undefined)).toEqual([]);
  });

  it('한글 태그 추출', () => {
    expect(extractTags('5/15 부가세 매입 #영수증 12장 #부가세')).toEqual(['영수증', '부가세']);
  });

  it('영문·숫자·언더스코어 태그', () => {
    expect(extractTags('test #foo123 #bar_baz')).toEqual(['foo123', 'bar_baz']);
  });

  it('중복 태그 제거', () => {
    expect(extractTags('#영수증 #영수증 다시')).toEqual(['영수증']);
  });

  it('태그 없으면 빈 배열', () => {
    expect(extractTags('일반 메시지 # 단독은 무시')).toEqual([]);
  });
});

describe('normalizeTags', () => {
  it('null 입력 + content 없으면 null', () => {
    expect(normalizeTags(null, null)).toBeNull();
  });

  it('수동 array + content 의 #태그 머지', () => {
    const result = normalizeTags(['수동'], '#자동태그 본문');
    expect(JSON.parse(result!)).toEqual(['수동', '자동태그']);
  });

  it('JSON string 파싱', () => {
    const result = normalizeTags('["json태그"]', null);
    expect(JSON.parse(result!)).toEqual(['json태그']);
  });

  it('comma string fallback', () => {
    const result = normalizeTags('a,b,c', null);
    expect(JSON.parse(result!)).toEqual(['a', 'b', 'c']);
  });

  it('중복 제거', () => {
    const result = normalizeTags(['a', 'b'], '#a #c');
    expect(JSON.parse(result!)).toEqual(['a', 'b', 'c']);
  });
});

describe('kst', () => {
  it('YYYY-MM-DD HH:MM:SS 형식', () => {
    expect(kst()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('UTC + 9시간 변환', () => {
    /* 2026-01-01 00:00 UTC → 2026-01-01 09:00 KST */
    const utcMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(kst(utcMs)).toBe('2026-01-01 09:00:00');
  });
});

describe('timingSafeEqual', () => {
  it('같은 문자열 true', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('한글키', '한글키')).toBe(true);
  });

  it('다른 문자열 false', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false); /* 길이 다름 */
  });

  it('non-string false', () => {
    expect(timingSafeEqual('abc', null as any)).toBe(false);
    expect(timingSafeEqual(123 as any, '123')).toBe(false);
  });

  it('빈 문자열 같으면 true', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });
});
