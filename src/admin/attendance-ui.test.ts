/**
 * 근태·연차 사장님 모달 (admin-attend.js) — 렌더 계약.
 *
 * admin-attend.js 는 classic script 라 import 할 수 없어 파일을 통째로 평가해 렌더 함수를 꺼낸다
 * (복사본 검증 금지 — 실제 배포 파일을 돌린다). 타이머·fetch 는 막아 둔다.
 *
 * 여기서 지키는 것:
 *  1. 안 찍은 직원은 "미출근", 연차는 "연차", 당번은 뱃지 — 오늘 화면에서 한눈에
 *  2. 지각은 빨강
 *  3. 사장님(owner) 이 아니면 수정·승인·확정·순서편집 버튼이 아예 그려지지 않는다
 *     (서버도 막지만, 직원이 눌렀다가 403 을 보는 화면이면 안 된다)
 *  4. 당번 날 연차 신청은 승인 버튼 대신 "교체 먼저" 가 보인다
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

type Fn = (...a: unknown[]) => string;
const M = (() => {
  const src = readFileSync('admin-attend.js', 'utf8');
  const names = ['_atTodayHtml', '_atMonthHtml', '_atDutyHtml', '_atLeaveHtml', '_atGrantHtml', '_atCellHtml'];
  return new Function('setTimeout', 'setInterval', 'fetch',
    src + '\nreturn {' + names.join(',') + '};')(() => 0, () => 0, () => Promise.reject(new Error('no fetch'))) as Record<string, Fn>;
})();

const settings = { duty_start: '09:00', normal_start: '09:30', grace_minutes: 1 };
const cell = (o: Record<string, unknown> = {}) => ({ duty: false, start: '09:30', check_in: null, late: false, leave: null, note: null, edited: false, ...o });

describe('오늘', () => {
  const d = (owner: boolean) => ({
    today: '2026-10-05', weekday: true, settings, owner, duty_user: 11, duty_name: '김당번',
    rows: [
      { id: 11, name: '김당번', ...cell({ duty: true, start: '09:00', check_in: '09:05', late: true }) },
      { id: 12, name: '이정상', ...cell({ check_in: '09:20' }) },
      { id: 13, name: '박연차', ...cell({ leave: 'approved' }) },
      { id: 14, name: '최미출', ...cell() },
    ],
  });

  it('당번·지각·정상·연차·미출근이 한눈에 보인다', () => {
    const h = M._atTodayHtml(d(true));
    expect(h).toContain('당번 김당번 · 09:00');
    expect(h).toContain('<span class="late">09:05</span>');
    expect(h).toContain('pill late">지각');
    expect(h).toContain('pill ok">정상');
    expect(h).toContain('pill leave">연차');
    expect(h).toContain('미출근');
  });

  it('이름은 escape 된다', () => {
    const x = d(true); x.rows[0].name = '<img src=x onerror=alert(1)>';
    expect(M._atTodayHtml(x)).not.toContain('<img');
  });

  it('직원이 없으면 "👑 관리자" 안내', () => {
    expect(M._atTodayHtml({ ...d(true), rows: [] })).toContain('👑 관리자');
  });
});

describe('월별', () => {
  const d = (owner: boolean) => ({
    month: '2026-10', owner, settings, today: '2026-10-07',
    days: ['2026-10-05', '2026-10-06', '2026-10-07'],
    rows: [
      { id: 11, name: '김당번', sum: { checked: 2, late: 1, leave: 0, duty: 3 },
        cells: { '2026-10-05': cell({ duty: true, check_in: '09:05', late: true }), '2026-10-06': cell({ duty: true, check_in: '08:55' }), '2026-10-07': cell({ duty: true }) } },
      { id: 12, name: '이정상', sum: { checked: 1, late: 0, leave: 1, duty: 0 },
        cells: { '2026-10-05': cell({ check_in: '09:20' }), '2026-10-06': cell({ leave: 'approved' }), '2026-10-07': cell() } },
    ],
  });

  it('직원 × 날짜 칸 수가 맞다', () => {
    const h = M._atMonthHtml(d(true));
    /* 행 2 × 날짜 3 = 데이터 칸 6 (owner 면 전부 click) */
    expect((h.match(/onclick="_atEdit\(/g) || []).length).toBe(6);
  });

  it('owner 가 아니면 칸 수정이 안 된다', () => {
    expect(M._atMonthHtml(d(false))).not.toContain('_atEdit(');
  });

  it('CSV 버튼과 합계가 있다', () => {
    const h = M._atMonthHtml(d(true));
    expect(h).toContain('_atCsv()');
    expect(h).toContain('<td class="late">1</td>');
  });
});

describe('당번표', () => {
  const d = (owner: boolean) => ({
    owner, from: '2026-10-05', weeks: 1, today: '2026-10-05',
    staff: [{ id: 11, name: '가' }, { id: 12, name: '나' }, { id: 13, name: '다' }],
    rotation: { id: 1, effective_from: '2026-10-05', members: [11, 12, 13], names: ['가', '나', '다'] },
    upcoming: [],
    grid: [{ monday: '2026-10-05', days: ['05', '06', '07', '08', '09'].map((x, i) => ({
      date: '2026-10-' + x, user_id: i === 2 ? 12 : 11, name: i === 2 ? '나' : '가', override: i === 2 ? 'swap' : null, on_leave: false })) }],
    swaps: [{ id: 1, from_user: 11, to_user: 12, from_name: '가', to_name: '나', duty_date: '2026-10-07', return_date: null, reason: '병원', status: 'accepted', requested_at: '2026-10-01 10:00:00' }],
  });

  it('현재 순서와 교체 표시가 보인다', () => {
    const h = M._atDutyHtml(d(false), null);
    expect(h).toContain('가 → 나 → 다');
    expect(h).toContain('pill gray">교체');
    expect(h).toContain('병원');
  });

  it('owner 만 순서 편집·하루 지정이 보인다', () => {
    expect(M._atDutyHtml(d(true), null)).toContain('_atSaveRotation()');
    expect(M._atDutyHtml(d(true), null)).toContain('_atDutySet(');
    const viewer = M._atDutyHtml(d(false), null);
    expect(viewer).not.toContain('_atSaveRotation');
    expect(viewer).not.toContain('_atDutySet(');
    expect(viewer).not.toContain('_atOrdMove');
  });
});

describe('연차 승인함', () => {
  const d = (owner: boolean) => ({
    owner, year: 2026, settings, rows: [],
    pending: [
      { id: 1, user_id: 12, name: '나', leave_date: '2026-10-09', reason: '가족 행사', remaining: 10, is_duty: false },
      { id: 2, user_id: 11, name: '가', leave_date: '2026-10-08', reason: '', remaining: 5, is_duty: true },
    ],
    recent: [{ id: 3, user_id: 13, name: '다', leave_date: '2026-10-02', status: 'approved', review_note: null }],
  });

  it('당번 날 신청은 승인 대신 "교체 먼저"', () => {
    const h = M._atLeaveHtml(d(true));
    expect(h).toContain('_atReview(1,true)');
    expect(h).not.toContain('_atReview(2,true)');
    expect(h).toContain('교체 먼저');
  });

  it('owner 가 아니면 승인·반려·승인취소 버튼이 없다', () => {
    const h = M._atLeaveHtml(d(false));
    expect(h).not.toContain('_atReview(');
    expect(h).not.toContain('_atLeaveCancel(');
  });
});

describe('연차 부여', () => {
  const d = (owner: boolean) => ({
    owner, year: 2026, settings,
    rows: [
      { id: 11, name: '가', hire_date: '2023-03-02', tracked: true, suggested: 16, basis: '근속 3년차 → 15일 + 가산 1일 = 16일', days: null, approved: 0, pending: 0, remaining: null },
      { id: 12, name: '나', hire_date: null, tracked: true, suggested: null, basis: null, days: 15, approved: 2, pending: 1, remaining: 13 },
    ],
  });

  it('제안값과 근거가 보이고, 미확정은 표시된다', () => {
    const h = M._atGrantHtml(d(true));
    expect(h).toContain('16일');
    expect(h).toContain('가산 1일');
    expect(h).toContain('미확정');
    expect(h).toContain('입사일 필요');
    /* 미확정 칸은 제안값으로 미리 채워진다 */
    expect(h).toContain('id="atG11" value="16"');
  });

  it('owner 가 아니면 확정·입사일·기준시각 입력이 없다', () => {
    const h = M._atGrantHtml(d(false));
    expect(h).not.toContain('_atGrant(');
    expect(h).not.toContain('_atProfile(');
    expect(h).not.toContain('_atSaveSettings');
  });

  it('유예 1분 안내', () => {
    expect(M._atGrantHtml(d(true))).toContain('09:01 까지 정상');
  });
});
