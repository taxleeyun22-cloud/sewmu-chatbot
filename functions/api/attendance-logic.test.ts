/**
 * 근태 판정 · 연차 신청 — 사장님 2026-10-01:
 *   "1분까진 봐준다고 하자" / "당번때 연차면.." (대타 먼저)
 *
 * 여기서 지키는 것:
 *  1. 지각은 화면에 보이는 HH:MM 기준 + 1분 유예 (09:01:59 는 정상)
 *  2. 당번이면 09:00, 아니면 09:30 기준
 *  3. 당번 날 연차는 교체가 잡히기 전엔 신청이 안 된다
 *  4. 대기 건까지 세서 잔여를 넘기지 못한다, 승인 순간에 다시 검사한다
 */
import { describe, it, expect } from 'vitest';
import {
  isLate, expectedStart, weekdaysBetween, checkLeaveRequest, checkLeaveApprove, dutyFor, buildCsv,
  // @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
} from './_attendance-core.js';

const S = { duty_start: '09:00', normal_start: '09:30', grace_minutes: 1 };

describe('지각 — 1분 유예', () => {
  it('당번 09:00 기준', () => {
    const st = expectedStart(true, S);
    expect(st).toBe('09:00');
    expect(isLate('2026-10-05 08:59:00', st, 1)).toBe(false);
    expect(isLate('2026-10-05 09:00:30', st, 1)).toBe(false);
    expect(isLate('2026-10-05 09:01:59', st, 1)).toBe(false);   // 화면에 09:01 — 봐준다
    expect(isLate('2026-10-05 09:02:00', st, 1)).toBe(true);
  });

  it('일반 09:30 기준', () => {
    const st = expectedStart(false, S);
    expect(st).toBe('09:30');
    expect(isLate('2026-10-05 09:31:59', st, 1)).toBe(false);
    expect(isLate('2026-10-05 09:32:00', st, 1)).toBe(true);
    /* 당번이 아닌 날 09:20 은 정상 */
    expect(isLate('2026-10-05 09:20:00', st, 1)).toBe(false);
  });

  it('유예 0분이면 09:01 부터 지각', () => {
    expect(isLate('2026-10-05 09:00:59', '09:00', 0)).toBe(false);
    expect(isLate('2026-10-05 09:01:00', '09:00', 0)).toBe(true);
  });

  it('교체로 당번이 된 날은 09:00 기준이 적용된다', () => {
    const ROT = [{ id: 1, effective_from: '2026-10-05', members: [11, 12, 13] }];
    const duty = dutyFor('2026-10-07', ROT, { '2026-10-07': 12 });
    expect(duty).toBe(12);
    expect(expectedStart(duty === 12, S)).toBe('09:00');
    expect(isLate('2026-10-07 09:10:00', expectedStart(duty === 12, S), 1)).toBe(true);
  });

  it('출근 기록이 없으면 지각이 아니다 (미출근은 따로 표시)', () => {
    expect(isLate(null, '09:00', 1)).toBe(false);
  });
});

describe('연차 신청', () => {
  const ROT = [{ id: 1, effective_from: '2026-10-05', members: [11, 12, 13] }];
  const dutyOf = (d: string) => dutyFor(d, ROT, {});
  const base = { userId: 12, today: '2026-10-05', dutyOf, grant: { days: 15 }, used: 0, taken: new Set<string>() };

  it('기간을 고르면 평일만 펼친다', () => {
    expect(weekdaysBetween('2026-10-08', '2026-10-13')).toEqual(['2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13']);
  });

  it('정상 신청은 정리된 날짜를 돌려준다', () => {
    expect(checkLeaveRequest({ ...base, dates: ['2026-10-08', '2026-10-07', '2026-10-08'] }).dates).toEqual(['2026-10-07', '2026-10-08']);
  });

  it('당번 날이 끼면 거부 — 교체가 먼저', () => {
    /* 12 는 10/12 주 당번 */
    const r = checkLeaveRequest({ ...base, dates: ['2026-10-09', '2026-10-12'] });
    expect(r.error).toContain('당번');
    expect(r.duty_date).toBe('2026-10-12');
  });

  it('교체가 수락되어 당번이 아니게 되면 통과', () => {
    const swapped = (d: string) => dutyFor(d, ROT, { '2026-10-12': 13 });
    expect(checkLeaveRequest({ ...base, dutyOf: swapped, dates: ['2026-10-12'] }).dates).toEqual(['2026-10-12']);
  });

  it('잔여를 넘기면 거부 — 대기 건도 센다', () => {
    expect(checkLeaveRequest({ ...base, grant: { days: 2 }, used: 1, dates: ['2026-10-07', '2026-10-08'] }).error).toContain('잔여');
  });

  it('연차가 확정되기 전에는 신청이 안 된다', () => {
    expect(checkLeaveRequest({ ...base, grant: null, dates: ['2026-10-07'] }).error).toContain('확정');
  });

  it('지난 날짜·주말·이미 신청한 날·연도 넘김은 거부', () => {
    expect(checkLeaveRequest({ ...base, dates: ['2026-10-02'] }).error).toContain('지난');
    expect(checkLeaveRequest({ ...base, dates: ['2026-10-10'] }).error).toContain('주말');
    expect(checkLeaveRequest({ ...base, taken: new Set(['2026-10-07']), dates: ['2026-10-07'] }).error).toContain('이미');
    expect(checkLeaveRequest({ ...base, today: '2026-12-01', dates: ['2026-12-31', '2027-01-04'] }).error).toContain('연도');
  });

  it('오늘 날짜는 신청할 수 있다', () => {
    expect(checkLeaveRequest({ ...base, today: '2026-10-07', dates: ['2026-10-07'] }).dates).toEqual(['2026-10-07']);
  });
});

describe('연차 승인 — 그 순간에 다시 검사', () => {
  const ROT = [{ id: 1, effective_from: '2026-10-05', members: [11, 12, 13] }];
  it('그 사이 당번이 돌아왔으면 승인 거부', () => {
    const dutyOf = (d: string) => dutyFor(d, ROT, { '2026-10-07': 12 });
    expect(checkLeaveApprove({ userId: 12, date: '2026-10-07', dutyOf, grant: { days: 15 }, approved: 0 })).toContain('당번');
  });
  it('이미 다 썼으면 거부', () => {
    const dutyOf = (d: string) => dutyFor(d, ROT, {});
    expect(checkLeaveApprove({ userId: 12, date: '2026-10-07', dutyOf, grant: { days: 3 }, approved: 3 })).toContain('잔여');
  });
  it('정상이면 통과', () => {
    const dutyOf = (d: string) => dutyFor(d, ROT, {});
    expect(checkLeaveApprove({ userId: 12, date: '2026-10-07', dutyOf, grant: { days: 3 }, approved: 2 })).toBeNull();
  });
});

describe('CSV', () => {
  it('BOM + CRLF + 쉼표·따옴표 escape', () => {
    const csv = buildCsv(['직원', '메모'], [['홍길동', '외근, "세무서"']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
    expect(csv).toContain('"외근, ""세무서"""');
  });
});
