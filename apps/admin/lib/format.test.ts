/**
 * Phase 11 cleanup (2026-05-12): format helpers 단위 테스트.
 */
import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatWon,
  formatNumber,
  formatCompactNumber,
  formatUserName,
  formatUserNameWithId,
  truncate,
} from './format';

describe('formatDate', () => {
  it('ISO string → YYYY-MM-DD (KST)', () => {
    expect(formatDate('2026-05-12T09:00:00Z')).toBe('2026-05-12');
  });

  it('null/undefined → "-"', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate('')).toBe('-');
  });

  it('invalid → "-"', () => {
    expect(formatDate('not a date')).toBe('-');
  });
});

describe('formatDateTime', () => {
  it('ISO string → YYYY-MM-DD HH:mm', () => {
    const out = formatDateTime('2026-05-12T09:00:00Z');
    /* KST 18:00 */
    expect(out).toMatch(/2026-05-12 18:00/);
  });

  it('null → "-"', () => {
    expect(formatDateTime(null)).toBe('-');
  });
});

describe('formatRelative', () => {
  const NOW = new Date('2026-05-12T18:00:00Z').getTime();

  it('30초 전 → "방금"', () => {
    const t = new Date(NOW - 30 * 1000);
    expect(formatRelative(t, NOW)).toBe('방금');
  });

  it('3분 전', () => {
    const t = new Date(NOW - 3 * 60 * 1000);
    expect(formatRelative(t, NOW)).toBe('3분 전');
  });

  it('2시간 전', () => {
    const t = new Date(NOW - 2 * 3600 * 1000);
    expect(formatRelative(t, NOW)).toBe('2시간 전');
  });

  it('어제 (1.5일)', () => {
    const t = new Date(NOW - 1.5 * 86400 * 1000);
    expect(formatRelative(t, NOW)).toBe('어제');
  });

  it('5일 전', () => {
    const t = new Date(NOW - 5 * 86400 * 1000);
    expect(formatRelative(t, NOW)).toBe('5일 전');
  });

  it('8일 전 → 절대 날짜', () => {
    const t = new Date('2026-05-04T00:00:00Z');
    expect(formatRelative(t, NOW)).toMatch(/2026-05-04/);
  });

  it('null → "-"', () => {
    expect(formatRelative(null, NOW)).toBe('-');
  });
});

describe('formatWon', () => {
  it('1234567 → "1,234,567원"', () => {
    expect(formatWon(1234567)).toBe('1,234,567원');
  });

  it('0 → "0원"', () => {
    expect(formatWon(0)).toBe('0원');
  });

  it('null/undefined → "-"', () => {
    expect(formatWon(null)).toBe('-');
    expect(formatWon(undefined)).toBe('-');
  });

  it('NaN → "-"', () => {
    expect(formatWon(NaN)).toBe('-');
  });
});

describe('formatNumber', () => {
  it('1234567 → "1,234,567" (단위 X)', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('null → "-"', () => {
    expect(formatNumber(null)).toBe('-');
  });
});

describe('formatCompactNumber', () => {
  it('1500 → 좁은 표기', () => {
    const out = formatCompactNumber(1500);
    /* "1.5천" 또는 "1.5K" — locale 따라 다름. 어쨌든 숫자 그대로는 안 됨 */
    expect(out).not.toBe('1500');
    expect(out.length).toBeLessThan('1500'.length + 2);
  });

  it('null → "-"', () => {
    expect(formatCompactNumber(null)).toBe('-');
  });
});

describe('formatUserName', () => {
  it('real_name 우선', () => {
    expect(formatUserName({ real_name: '박승호', name: 'parksh', id: 42 })).toBe('박승호');
  });

  it('real_name 없으면 name', () => {
    expect(formatUserName({ name: 'parksh', id: 42 })).toBe('parksh');
  });

  it('둘 다 없으면 "#id"', () => {
    expect(formatUserName({ id: 42 })).toBe('#42');
  });

  it('id 도 없으면 "익명"', () => {
    expect(formatUserName({})).toBe('익명');
    expect(formatUserName(null)).toBe('익명');
  });
});

describe('formatUserNameWithId', () => {
  it('이름 (#id)', () => {
    expect(formatUserNameWithId({ real_name: '박승호', id: 42 })).toBe('박승호 (#42)');
  });

  it('이름 없으면 #id', () => {
    expect(formatUserNameWithId({ id: 42 })).toBe('#42');
  });

  it('id 도 없으면 "익명"', () => {
    expect(formatUserNameWithId({})).toBe('익명');
  });
});

describe('truncate', () => {
  it('짧으면 그대로', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('초과시 ... 추가', () => {
    expect(truncate('hello world!', 5)).toBe('hello…');
  });

  it('Unicode-safe — surrogate pair 안 깨짐', () => {
    /* 단일 codepoint 이모지 (variation selector 없는) */
    expect(truncate('🌟🌙🌞🌈🎉', 3)).toBe('🌟🌙🌞…');
  });

  it('한글 (BMP) 정상', () => {
    expect(truncate('안녕하세요', 3)).toBe('안녕하…');
  });

  it('null → ""', () => {
    expect(truncate(null, 5)).toBe('');
  });
});
