/**
 * 당번 — 사장님 2026-10-01: "3명중 1명은 9시 나머지는 9시30분출근 한주단위로 당번 …
 * 지들끼리 교체도 가능해야할듯 당번때 연차면.."
 *
 * 여기서 지키는 것:
 *  1. 순서만 정하면 주마다 자동으로 돈다 (주말 당번 없음)
 *  2. 순서를 바꿔도 지난 주 당번은 그대로다 — 지각 판정이 소급해서 바뀌면 안 된다
 *  3. 하루 교체가 주 순서보다 우선한다
 *  4. 교체는 "내 당번 날" 만, 상대가 그날 연차면 수락이 안 된다, 수락 순간에 다시 검사한다
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { dutyFor, weeklyDuty, mondayOf, checkSwapRequest, checkSwapAccept } from './_attendance-core.js';

const A = 11, B = 12, C = 13;
const ROT = [{ id: 1, effective_from: '2026-10-05', members: [A, B, C] }];

describe('주 단위 순환', () => {
  it('A → B → C → 다시 A', () => {
    expect(weeklyDuty('2026-10-05', ROT)).toBe(A);
    expect(weeklyDuty('2026-10-09', ROT)).toBe(A);   // 같은 주 금요일
    expect(weeklyDuty('2026-10-12', ROT)).toBe(B);
    expect(weeklyDuty('2026-10-21', ROT)).toBe(C);
    expect(weeklyDuty('2026-10-26', ROT)).toBe(A);
  });

  it('주말에는 당번이 없다', () => {
    expect(dutyFor('2026-10-10', ROT, {})).toBeNull();
    expect(dutyFor('2026-10-11', ROT, {})).toBeNull();
  });

  it('순서를 정하기 전 주에는 당번이 없다', () => {
    expect(dutyFor('2026-09-30', ROT, {})).toBeNull();
  });

  it('mondayOf 는 일요일을 앞 주로 붙인다', () => {
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
  });
});

describe('순서 변경 — 지난 주는 그대로', () => {
  /* 10/19 주부터 C,A,B 로 바꿨다 */
  const ROT2 = [...ROT, { id: 2, effective_from: '2026-10-19', members: [C, A, B] }];

  it('변경 전 주의 당번이 바뀌지 않는다', () => {
    expect(dutyFor('2026-10-05', ROT2, {})).toBe(A);
    expect(dutyFor('2026-10-12', ROT2, {})).toBe(B);
  });

  it('변경한 주부터 새 순서의 첫 사람이다', () => {
    expect(dutyFor('2026-10-19', ROT2, {})).toBe(C);
    expect(dutyFor('2026-10-26', ROT2, {})).toBe(A);
  });

  it('같은 적용일로 두 번 저장하면 나중 것이 이긴다', () => {
    const ROT3 = [...ROT, { id: 5, effective_from: '2026-10-05', members: [B, A] }];
    expect(dutyFor('2026-10-05', ROT3, {})).toBe(B);
  });
});

describe('하루 교체', () => {
  it('덮어쓰기가 주 순서보다 우선한다', () => {
    expect(dutyFor('2026-10-07', ROT, { '2026-10-07': B })).toBe(B);
    /* 다른 날은 그대로 */
    expect(dutyFor('2026-10-08', ROT, { '2026-10-07': B })).toBe(A);
  });
});

describe('교체 요청 검사', () => {
  const dutyOf = (d: string) => dutyFor(d, ROT, {});
  const base = { today: '2026-10-05', dutyOf, staffIds: [A, B, C] };

  it('내 당번 날이면 통과', () => {
    expect(checkSwapRequest({ ...base, fromUser: A, toUser: B, dutyDate: '2026-10-07' })).toBeNull();
  });

  it('내 당번이 아닌 날은 거부', () => {
    expect(checkSwapRequest({ ...base, fromUser: B, toUser: C, dutyDate: '2026-10-07' })).toContain('내 당번이 아닙니다');
  });

  it('지난 날짜·주말·자기 자신·직원 아닌 사람은 거부', () => {
    expect(checkSwapRequest({ ...base, today: '2026-10-08', fromUser: A, toUser: B, dutyDate: '2026-10-07' })).toContain('지난');
    expect(checkSwapRequest({ ...base, fromUser: A, toUser: B, dutyDate: '2026-10-10' })).toContain('주말');
    expect(checkSwapRequest({ ...base, fromUser: A, toUser: A, dutyDate: '2026-10-07' })).toBeTruthy();
    expect(checkSwapRequest({ ...base, fromUser: A, toUser: 99, dutyDate: '2026-10-07' })).toContain('근태 대상');
  });

  it('맞교환 날짜는 상대 당번 날이어야 한다', () => {
    expect(checkSwapRequest({ ...base, fromUser: A, toUser: B, dutyDate: '2026-10-07', returnDate: '2026-10-14' })).toBeNull();
    expect(checkSwapRequest({ ...base, fromUser: A, toUser: B, dutyDate: '2026-10-07', returnDate: '2026-10-21' })).toContain('상대방 당번이 아닙니다');
  });
});

describe('교체 수락 — 그 순간에 다시 검사', () => {
  const swap = { from_user: A, to_user: B, duty_date: '2026-10-07', return_date: '2026-10-14' };
  const ctx = (overrides: Record<string, number> = {}, leaves: string[] = []) => ({
    swap, today: '2026-10-05', staffIds: [A, B, C],
    dutyOf: (d: string) => dutyFor(d, ROT, overrides),
    hasLeave: (u: number, d: string) => leaves.includes(u + '|' + d),
  });

  it('조건이 그대로면 통과', () => {
    expect(checkSwapAccept(ctx())).toBeNull();
  });

  it('대신 설 사람이 그날 연차면 거부', () => {
    expect(checkSwapAccept(ctx({}, [B + '|2026-10-07']))).toContain('연차');
  });

  it('맞교환 날 요청자가 연차면 거부', () => {
    expect(checkSwapAccept(ctx({}, [A + '|2026-10-14']))).toContain('연차');
  });

  it('요청 이후 사장님이 그날 당번을 바꿨으면 거부', () => {
    expect(checkSwapAccept(ctx({ '2026-10-07': C }))).toContain('교체할 수 없게');
  });
});
