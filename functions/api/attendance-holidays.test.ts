/**
 * 공휴일 — 사장님 2026-10-02: "법정공휴일은 체크 안되나??"
 *
 * 여기서 지키는 것:
 *  1. 날짜 고정 공휴일 8개는 코드가 안다
 *  2. 대체공휴일: 삼일절·어린이날·광복절·개천절·한글날·기독탄신일·부처님오신날 은 토·일 겹침,
 *     설·추석 연휴는 일요일·다른 공휴일 겹침 → 다음 첫 평일. 신정·현충일은 없음
 *  3. 공휴일엔 당번이 없고, 연차 신청·교체가 막힌다
 *  4. 등록(음력 명절·선거일)은 그 해 것만 쓴다
 */
import { describe, it, expect } from 'vitest';
import {
  holidayMap, isWorkday, workdaysBetween, dutyFor, checkLeaveRequest, checkSwapRequest,
  // @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
} from './_attendance-core.js';

const SEED_2026 = [
  { ymd: '2026-02-16', name: '설날 연휴', sub: 'sunday' }, { ymd: '2026-02-17', name: '설날', sub: 'sunday' }, { ymd: '2026-02-18', name: '설날 연휴', sub: 'sunday' },
  { ymd: '2026-05-24', name: '부처님오신날', sub: 'weekend' },
  { ymd: '2026-06-03', name: '제9회 전국동시지방선거', sub: null },
  { ymd: '2026-09-24', name: '추석 연휴', sub: 'sunday' }, { ymd: '2026-09-25', name: '추석', sub: 'sunday' }, { ymd: '2026-09-26', name: '추석 연휴', sub: 'sunday' },
];

describe('holidayMap — 2026', () => {
  const m = holidayMap(2026, SEED_2026);
  const names = (d: string) => m[d]?.name ?? null;

  it('날짜 고정 8개', () => {
    expect(names('2026-01-01')).toBe('신정');
    expect(names('2026-03-01')).toBe('삼일절');
    expect(names('2026-05-05')).toBe('어린이날');
    expect(names('2026-06-06')).toBe('현충일');
    expect(names('2026-08-15')).toBe('광복절');
    expect(names('2026-10-03')).toBe('개천절');
    expect(names('2026-10-09')).toBe('한글날');
    expect(names('2026-12-25')).toBe('기독탄신일');
  });

  it('대체공휴일 — 토·일과 겹치는 삼일절(일)·광복절(토)·개천절(토)·부처님오신날(일)', () => {
    expect(m['2026-03-02']).toEqual({ name: '삼일절 대체공휴일', sub: true });        // 3/1 일요일
    expect(m['2026-08-17']).toEqual({ name: '광복절 대체공휴일', sub: true });        // 8/15 토요일 → 월
    expect(m['2026-10-05']).toEqual({ name: '개천절 대체공휴일', sub: true });        // 10/3 토요일 → 월
    expect(m['2026-05-25']).toEqual({ name: '부처님오신날 대체공휴일', sub: true });  // 5/24 일요일
  });

  it('현충일(토)·신정은 대체공휴일 없음, 추석 연휴 마지막 날이 토요일이어도 대체 없음', () => {
    expect(names('2026-06-08')).toBeNull();
    expect(names('2026-09-28')).toBeNull();     // 9/26(토) — 설·추석은 일요일·공휴일 겹침만
    expect(names('2026-01-02')).toBeNull();
  });

  it('등록분은 그 해 것만, 잘못된 날짜는 무시', () => {
    const m2 = holidayMap(2027, [...SEED_2026, { ymd: 'abc', name: 'x', sub: null }]);
    expect(Object.keys(m2).some((d) => d.startsWith('2026'))).toBe(false);
    expect(m2['2027-02-17']).toBeUndefined();
  });

  it('공휴일 개수 — 2026: 고정 8 + 등록 8 + 대체 4 = 20', () => {
    expect(Object.keys(m).length).toBe(20);
  });
});

describe('holidayMap — 설·추석 겹침 규칙', () => {
  it('설날 연휴가 토·일·월이면 일요일 하루만 대체 → 화요일', () => {
    /* 가상의 해: 2027-02-06(토) 07(일) 08(월) */
    const m = holidayMap(2027, [
      { ymd: '2027-02-06', name: '설날 연휴', sub: 'sunday' }, { ymd: '2027-02-07', name: '설날', sub: 'sunday' }, { ymd: '2027-02-08', name: '설날 연휴', sub: 'sunday' },
    ]);
    expect(m['2027-02-09']).toEqual({ name: '설날 대체공휴일', sub: true });
    expect(m['2027-02-10']).toBeUndefined();
  });

  it('추석 연휴가 개천절(10/3)과 겹치면 다음 평일로 — 이미 공휴일인 날은 건너뛴다', () => {
    /* 2028-10-02(월) 03(화) 04(수) 가상 — 10/3 개천절과 겹침 */
    const m = holidayMap(2028, [
      { ymd: '2028-10-02', name: '추석 연휴', sub: 'sunday' }, { ymd: '2028-10-03', name: '추석', sub: 'sunday' }, { ymd: '2028-10-04', name: '추석 연휴', sub: 'sunday' },
    ]);
    expect(m['2028-10-03'].name).toBe('개천절');            // 먼저 등록된 이름 유지 (둘 다 공휴일)
    expect(m['2028-10-05']).toEqual({ name: '추석 대체공휴일', sub: true });
  });

  it('대체공휴일이 또 공휴일과 겹치면 그 다음 평일', () => {
    /* 10/9(금) 한글날 뒤 10/10 토·10/11 일 — 가상 임시공휴일 10/8(목) sub weekend 아님.
       10/3 개천절(토) → 10/5(월), 10/5 를 미리 임시공휴일로 등록하면 → 10/6 */
    const m = holidayMap(2026, [{ ymd: '2026-10-05', name: '임시공휴일', sub: null }]);
    expect(m['2026-10-05'].name).toBe('임시공휴일');
    expect(m['2026-10-06']).toEqual({ name: '개천절 대체공휴일', sub: true });
  });
});

describe('공휴일엔 당번·연차·교체가 없다', () => {
  const hol = holidayMap(2026, SEED_2026);
  const rot = [{ id: 1, effective_from: '2026-10-05', members: [11, 12, 13] }];

  it('isWorkday / workdaysBetween', () => {
    expect(isWorkday('2026-10-08', hol)).toBe(true);
    expect(isWorkday('2026-10-09', hol)).toBe(false);          // 한글날
    expect(isWorkday('2026-10-10', hol)).toBe(false);          // 토
    expect(isWorkday('2026-10-09')).toBe(true);                // 표 없이 부르면 평일만 본다 (옛 호출 호환)
    expect(workdaysBetween('2026-10-05', '2026-10-09', hol)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08']);   // 10/5 대체공휴일, 10/9 한글날
  });

  it('dutyFor — 공휴일 null, 사장님 지정이 있어도 null', () => {
    expect(dutyFor('2026-10-08', rot, {}, hol)).toBe(11);
    expect(dutyFor('2026-10-09', rot, {}, hol)).toBeNull();
    expect(dutyFor('2026-10-09', rot, { '2026-10-09': 12 }, hol)).toBeNull();
    expect(dutyFor('2026-10-09', rot, {})).toBe(11);           // 표 없이 부르면 종전대로
  });

  it('연차 신청에 공휴일이 끼면 거부 (이름을 알려준다)', () => {
    const r = checkLeaveRequest({ userId: 12, dates: ['2026-10-08', '2026-10-09'], today: '2026-10-02', dutyOf: () => 11, grant: { days: 15 }, used: 0, taken: new Set(), holidays: hol });
    expect(r.error).toContain('10/9(금) 은 공휴일(한글날)입니다');
    const ok = checkLeaveRequest({ userId: 12, dates: ['2026-10-08'], today: '2026-10-02', dutyOf: () => 11, grant: { days: 15 }, used: 0, taken: new Set(), holidays: hol });
    expect(ok.dates).toEqual(['2026-10-08']);
  });

  it('교체 요청 — 공휴일은 당번이 없어 거부', () => {
    const err = checkSwapRequest({ fromUser: 11, toUser: 12, dutyDate: '2026-10-09', today: '2026-10-02', dutyOf: () => 11, staffIds: [11, 12, 13], holidays: hol });
    expect(err).toContain('공휴일(한글날)');
    const ret = checkSwapRequest({ fromUser: 11, toUser: 12, dutyDate: '2026-10-08', returnDate: '2026-10-09', today: '2026-10-02', dutyOf: (d: string) => (d === '2026-10-08' ? 11 : 12), staffIds: [11, 12, 13], holidays: hol });
    expect(ret).toContain('맞교환 날짜');
  });
});
