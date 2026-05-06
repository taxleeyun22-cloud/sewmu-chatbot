/**
 * Phase #3 적용 (2026-05-06): memo-render 단위 테스트
 * 실행: npm test
 */

import { describe, it, expect } from 'vitest';
import { ddayBadge, formatBytes, memoIcon, MEMO_CATEGORY_ICONS } from './memo-render';

/* 2026-05-06 12:00:00 KST = 2026-05-06 03:00:00 UTC */
const TODAY_KST_MS = Date.UTC(2026, 4, 6, 3, 0, 0);

describe('ddayBadge', () => {
  it('null/빈 입력은 null', () => {
    expect(ddayBadge(null)).toBeNull();
    expect(ddayBadge('')).toBeNull();
    expect(ddayBadge('잘못된 날짜')).toBeNull();
  });

  it('오늘 → D-Day, today 상태', () => {
    const r = ddayBadge('2026-05-06', TODAY_KST_MS);
    expect(r).not.toBeNull();
    expect(r!.label).toBe('D-Day');
    expect(r!.status).toBe('today');
    expect(r!.daysLeft).toBe(0);
  });

  it('내일 → D-1, tomorrow', () => {
    const r = ddayBadge('2026-05-07', TODAY_KST_MS);
    expect(r!.label).toBe('D-1');
    expect(r!.status).toBe('tomorrow');
    expect(r!.daysLeft).toBe(1);
  });

  it('3일 후 → D-3, week', () => {
    const r = ddayBadge('2026-05-09', TODAY_KST_MS);
    expect(r!.label).toBe('D-3');
    expect(r!.status).toBe('week');
  });

  it('10일 후 → D-10, later', () => {
    const r = ddayBadge('2026-05-16', TODAY_KST_MS);
    expect(r!.label).toBe('D-10');
    expect(r!.status).toBe('later');
  });

  it('어제 → D+1, overdue', () => {
    const r = ddayBadge('2026-05-05', TODAY_KST_MS);
    expect(r!.label).toBe('D+1');
    expect(r!.status).toBe('overdue');
    expect(r!.daysLeft).toBe(-1);
  });
});

describe('formatBytes', () => {
  it('0 / null / undefined → 0B', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(null)).toBe('0B');
    expect(formatBytes(undefined)).toBe('0B');
  });

  it('< 1KB → B', () => {
    expect(formatBytes(500)).toBe('500B');
    expect(formatBytes(1023)).toBe('1023B');
  });

  it('1KB ~ 1MB → KB', () => {
    expect(formatBytes(1024)).toBe('1.0KB');
    expect(formatBytes(1234)).toBe('1.2KB');
    expect(formatBytes(1024 * 1023)).toBe('1023.0KB');
  });

  it('1MB ~ 1GB → MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB');
    expect(formatBytes(1234567)).toBe('1.2MB');
  });

  it('> 1GB → GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0GB');
    expect(formatBytes(1234567890)).toBe('1.1GB');
  });
});

describe('memoIcon', () => {
  it('정의된 카테고리 → 매핑된 아이콘', () => {
    expect(memoIcon('할 일')).toBe('📌');
    expect(memoIcon('거래처 정보')).toBe('🏢');
    expect(memoIcon('완료')).toBe('✅');
    expect(memoIcon('전화')).toBe('📞');
    expect(memoIcon('문서')).toBe('📁');
    expect(memoIcon('이슈')).toBe('⚠️');
    expect(memoIcon('약속')).toBe('📅');
    expect(memoIcon('일반')).toBe('📝');
  });

  it('미정의·null → fallback 📝', () => {
    expect(memoIcon('알 수 없음')).toBe('📝');
    expect(memoIcon(null)).toBe('📝');
    expect(memoIcon(undefined)).toBe('📝');
    expect(memoIcon('')).toBe('📝');
  });

  it('MEMO_CATEGORY_ICONS map 노출됨', () => {
    expect(MEMO_CATEGORY_ICONS).toBeTypeOf('object');
    expect(MEMO_CATEGORY_ICONS['할 일']).toBe('📌');
  });
});
