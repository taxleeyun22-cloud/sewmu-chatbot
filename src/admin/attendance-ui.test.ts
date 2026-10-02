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

  /* 사장님 2026-10-02: "출근시간 내가 수정하는 거 없어졌네?" — 오늘 탭에서도 출근 칸을 누르면 수정 */
  it('owner 는 오늘 탭 출근 칸을 눌러 수정, 직원은 아니다', () => {
    const h = M._atTodayHtml(d(true));
    expect(h).toContain('onclick="_atEdit(11,\'2026-10-05\')"');
    expect(h).toContain('(누르면 수정)');
    expect(M._atTodayHtml(d(false))).not.toContain('_atEdit(');
  });

  /* 사장님 2026-10-02: "당번이 다 없으면 9시가 출근임" */
  it('당번 없는 날은 "당번 없음 · 전원 09:00", 당번 연차면 "당번 OO 연차 · 전원 09:00"', () => {
    const none = M._atTodayHtml({ ...d(true), duty_user: null, duty_name: null, no_duty: true, duty_absent: false });
    expect(none).toContain('당번 없음 · 전원 09:00');
    expect(none).not.toContain('일반 09:30');
    const absent = M._atTodayHtml({ ...d(true), no_duty: true, duty_absent: true });
    expect(absent).toContain('당번 김당번 연차 · 전원 09:00');
    expect(M._atTodayHtml(d(true))).toContain('일반 09:30');
  });

  it('공휴일이면 이름과 함께 안내', () => {
    expect(M._atTodayHtml({ ...d(true), weekday: false, holiday: '한글날' })).toContain('오늘은 공휴일입니다 (한글날)');
    expect(M._atTodayHtml({ ...d(true), weekday: false })).toContain('오늘은 주말입니다');
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

  /* 사장님 2026-10-02: "월별로 직원별로 연차 언제 썼는지 체크 좀 하자" + 공휴일 */
  it('공휴일 열은 빨강 머리글 + 주말 취급, 아래에 "이달 연차 — 직원별" 표', () => {
    const x: any = d(true);
    x.holidays = { '2026-10-09': '한글날' };
    x.days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09'];
    x.rows[0].cells['2026-10-09'] = cell({ check_in: '10:00' });   // 공휴일 출근 기록이 있으면 칸이 생긴다
    const h = M._atMonthHtml(x);
    expect(h).toContain('<th class="holi" title="한글날">9<br>금</th>');
    expect(h).toContain('공휴일: 10/9(금) 한글날');
    expect(h).toContain('이달 연차 — 직원별');
    /* 이정상: 10/6 승인 1일 · 김당번: 없음 */
    expect(h).toContain('<b>이정상</b></td><td><span class="pill leave" style="margin:1px 2px 1px 0">10/6(화)</span></td><td></td><td><b>1</b>일</td>');
    expect(h).toContain('<b>김당번</b></td><td><span style="color:var(--text-mute)">—</span></td>');
    expect(M._atMonthHtml({ ...d(true), rows: d(true).rows.map((r) => ({ ...r, cells: { '2026-10-05': cell() } })) })).toContain('이달에 쓴 연차가 없습니다');
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

  /* 사장님 2026-10-02: "당번표에서 교체 요청 이런 거 있음 좋을 듯" */
  it('직원: 내 당번 칸(오늘 이후)에만 [교체] 버튼, 보낸 요청이 대기 중이면 "요청 중"', () => {
    const x = { ...d(false), me_id: 11, today: '2026-10-06',
      swaps: [{ id: 2, from_user: 11, to_user: 12, from_name: '가', to_name: '나', duty_date: '2026-10-08', return_date: null, reason: '', status: 'pending', requested_at: '2026-10-05 10:00:00' }] };
    const h = M._atDutyHtml(x, null);
    expect(h).not.toContain("_atDutySwap('2026-10-05')");     // 지난 날
    expect(h).toContain("_atDutySwap('2026-10-06')");         // 오늘
    expect(h).not.toContain("_atDutySwap('2026-10-07')");     // 나(12) 당번
    expect(h).not.toContain("_atDutySwap('2026-10-08')");     // 요청 중
    expect(h).toContain('요청 중');
    expect(h).toContain("_atDutySwap('2026-10-09')");
    expect(h).toContain('내 당번 날의 [교체]');
  });

  it('me_id 가 없으면(사장님 비번 접속) 교체 버튼 없음, owner 화면에도 없음', () => {
    expect(M._atDutyHtml({ ...d(false), me_id: null }, null)).not.toContain('_atDutySwap');
    expect(M._atDutyHtml({ ...d(true), me_id: 11 }, null)).not.toContain('_atDutySwap');
  });

  it('공휴일 칸은 "휴" + 이름, select 없음', () => {
    const x = d(true);
    x.grid[0].days[4] = { ...x.grid[0].days[4], holiday: '한글날', user_id: null, name: null } as any;
    const h = M._atDutyHtml(x, null);
    expect(h).toContain('<td class="we holi" title="한글날"><span class="pill late">휴</span>');
    expect(h).toContain('한글날</div></td>');
    expect(h).not.toContain("_atDutySet('2026-10-09'");
    expect(h).toContain("_atDutySet('2026-10-08'");
  });

  it('owner 만 [주 전체] 일괄 지정이 보이고, 월~금 전부 같은 사람 지정이면 그 사람이 선택돼 있다', () => {
    const x = d(true);
    const h0 = M._atDutyHtml(x, null);
    expect(h0).toContain("_atDutySetWeek('2026-10-05'");
    expect(h0).toContain('<th>주 전체</th>');
    expect(M._atDutyHtml(d(false), null)).not.toContain('_atDutySetWeek');
    expect(M._atDutyHtml(d(false), null)).not.toContain('주 전체');
    x.grid[0].days.forEach((c) => { c.user_id = 13; c.name = '다'; c.override = 'owner'; });
    const h = M._atDutyHtml(x, null);
    const i = h.indexOf('_atDutySetWeek');
    const wk = h.slice(i, h.indexOf('</select>', i));
    expect(wk).toContain('value="13" selected');
    expect(wk).toContain('↺ 순서대로');
  });
});

/* 사장님 2026-10-02: "뭔가 확실하게 … 깔쌈하게" — 요약 띠 · 잔여 막대 · 묶음 카드 · 팀 달력 · 필터 */
describe('연차 승인함', () => {
  const row = (id: number, name: string, o: Record<string, unknown> = {}) => ({
    id, name, tracked: true, hire_date: null, suggested: null, basis: null, days: 15, approved: 0, pending: 0, remaining: 15, requests: [] as any[], ...o,
  });
  const d = (owner: boolean) => ({
    owner, year: 2026, today: '2026-10-05', settings, holidays: [{ ymd: '2026-10-09', name: '한글날', source: 'fixed', sub_rule: null }],
    rows: [
      row(11, '가', { approved: 3, remaining: 12, pending: 1 }),
      row(12, '나', { pending: 2, requests: [{ id: 1, leave_date: '2026-10-13', status: 'pending' }, { id: 2, leave_date: '2026-10-14', status: 'pending' }] }),
      row(13, '다', { approved: 2, remaining: 13, requests: [{ id: 3, leave_date: '2026-10-13', status: 'approved' }, { id: 5, leave_date: '2026-09-15', status: 'approved' }] }),
    ],
    pending: [
      { id: 1, user_id: 12, name: '나', leave_date: '2026-10-13', reason: '가족 행사', remaining: 15, is_duty: false, requested_at: '2026-10-01 09:00:00' },
      { id: 2, user_id: 12, name: '나', leave_date: '2026-10-14', reason: '가족 행사', remaining: 15, is_duty: false, requested_at: '2026-10-01 09:00:00' },
      { id: 4, user_id: 11, name: '가', leave_date: '2026-10-08', reason: '', remaining: 12, is_duty: true, requested_at: '2026-10-02 10:00:00' },
    ],
    recent: [
      { id: 3, user_id: 13, name: '다', leave_date: '2026-10-13', status: 'approved', review_note: null, requested_at: '2026-09-28 10:00:00', reviewed_at: '2026-09-29 11:00:00' },
      { id: 7, user_id: 13, name: '다', leave_date: '2026-09-15', status: 'cancelled', review_note: null, requested_at: '2026-09-01 10:00:00', reviewed_at: '2026-09-02 11:00:00' },
    ],
  });

  it('요약 띠 + 직원별 잔여 막대', () => {
    const h = M._atLeaveHtml(d(true));
    expect(h).toContain('<b>3</b>건 승인 대기');
    expect(h).toContain('<b>1</b>일 이달 연차');     // 다 10/13 승인
    expect(h).toContain('<b>2</b>일 올해 사용');     // 다 9/15 + 10/13
    expect(h).toContain('class="at-fill" style="width:20%');   // 가 3/15
    expect(h).toContain('3일 / 15일 · 잔여 <b>12일</b>');
  });

  it('한 번에 신청한 여러 날은 카드 한 장, 묶음 승인·반려 / 당번 날은 경고 + 승인 없음 / 전부 승인', () => {
    const h = M._atLeaveHtml(d(true));
    expect(h).toContain('<b>10/13(화)~10/14(수)</b> <span class="pill leave">2일</span>');
    expect(h).toContain('_atReviewMany([1,2],true)');
    expect(h).toContain('_atReviewMany([1,2],false)');
    expect(h).toContain('사유: 가족 행사');
    expect(h).toContain('10/8(목) 당번 — 교체가 먼저입니다');
    expect(h).not.toContain('_atReviewMany([4],true)');
    expect(h).toContain('_atReviewMany([4],false)');
    expect(h).toContain('전부 승인 (2)');                      // 당번 날은 빼고
    expect(h).toContain('같은 날 연차: 10/13(화) 다');          // 나의 10/13 ↔ 다 승인
  });

  it('팀 달력: 승인은 찬 점, 대기는 빈 점, 공휴일 빨강', () => {
    const h = M._atLeaveHtml(d(true));
    expect(h).toContain('2026년 10월');
    expect(h).toContain('class="at-dot" style="background:#d97706" title="다"');          // 10/13 다 승인 (3번째 색)
    expect(h).toContain('class="at-dot pend" style="border-color:#059669" title="나 (대기)"');
    expect(h).toContain('class="at-cal-d holi" title="한글날"');
    expect(h).toContain('onclick="_atTeamMonthGo(1)"');
  });

  it('최근 처리: 기본은 취소 숨김, 묶음 + 처리일·처리자, 승인 취소 버튼', () => {
    const h = M._atLeaveHtml(d(true));
    expect(h).toContain('09-29 사장님');
    expect(h).toContain('_atLeaveCancelMany([3])');
    expect(h).not.toContain('pill gray">취소');
    expect(h).toContain('class="at-chipbtn on" onclick="_atLvFilter=\'all\'');
  });

  it('대기 0건이면 빈 상태 + 다음 연차', () => {
    const h = M._atLeaveHtml({ ...d(true), pending: [] });
    expect(h).toContain('대기 중인 신청이 없어요');
    expect(h).toContain('다음 연차: <b>10/13(화) 다</b>');
    expect(h).not.toContain('전부 승인');
  });

  it('owner 가 아니면 승인·반려·취소 버튼이 없다', () => {
    const h = M._atLeaveHtml(d(false));
    expect(h).not.toContain('_atReviewMany(');
    expect(h).not.toContain('_atLeaveCancelMany(');
    expect(h).toContain('사장님 승인');
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

  it('유예 없음 안내 (사장님 2026-10-02 "1분 유예도 빼버리자")', () => {
    const h = M._atGrantHtml(d(true));
    expect(h).toContain('유예 없음');
    expect(h).not.toContain('atSGrace');
  });
});

/* 2026-10-01 사장님: "나를 관리자로 보냈어 바로떠야지 관리자만 근태 출첵이라니까"
   직원 = 👑 관리자 = admin 사용자. 출근 버튼은 admin 홈을 열면 그 자리에 있어야 한다.
   여기서 지키는 것:
    1. 홈 카드는 view=me 가 성공한 직원에게만 그려진다 — 실패(사장님 비번·대상 아님)면 빈 문자열
    2. 출근 전엔 큰 [출근], 찍은 뒤엔 시각 + 정상/지각, 주말엔 버튼 없음
    3. 받은 교체 요청은 홈 카드 위 띠, 내 근태 탭에서는 맨 위
    4. 내 근태 탭: 내 당번 날은 요일 칩, 연차 미확정이면 신청 버튼 없음, 당번 날 연차 거부 시 교체 바로가기 */
describe('admin 홈 출근 카드 · 내 근태 탭', () => {
  const src = readFileSync('admin-attend.js', 'utf8');
  const M2 = new Function('setTimeout', 'setInterval', 'fetch', 'document', 'location',
    src + '\nreturn { _atHomeCardHtml, _atMeHtml, _atTabsHtml, _atTabList };')(
    () => 0, () => 0, () => Promise.reject(new Error('no fetch')),
    { addEventListener: () => {}, getElementById: () => null, querySelector: () => null }, { origin: 'https://x.test' },
  ) as Record<string, (...a: unknown[]) => any>;

  const me = (over: Record<string, unknown> = {}) => ({
    ok: true, today: '2026-10-05', now: '2026-10-05 08:50:00', weekday: true,
    me: { id: 12, name: '박나래' }, settings,
    today_cell: cell({ start: '09:30' }),
    duty: {
      this_week: ['05', '06', '07', '08', '09'].map((x) => ({ date: '2026-10-' + x, user_id: 11, name: '김가영' })),
      next_week: ['12', '13', '14', '15', '16'].map((x) => ({ date: '2026-10-' + x, user_id: 12, name: '박나래' })),
      mine: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
    },
    swaps: { received: [], sent: [] },
    colleagues: [{ id: 11, name: '김가영' }, { id: 13, name: '최다인' }],
    leave: { year: 2026, days: 15, approved: 1, pending: 0, remaining: 14, requests: [] },
    month: { checked: 3, late: 1 },
    ...over,
  });

  it('홈 카드: 출근 전 — 큰 [출근] 버튼 + 기준시각 + 잔여 연차', () => {
    const h = M2._atHomeCardHtml(me());
    expect(h).toContain('id="haPunch"');
    expect(h).toContain('오늘 기준 09:30');
    expect(h).toContain('연차 잔여 <b>14일</b>');
    expect(h).toContain('박나래 님');
  });

  it('홈 카드: 당번 없는 날은 "오늘 당번 없음 · 전원 09:00"', () => {
    expect(M2._atHomeCardHtml(me({ today_cell: cell({ no_duty: true, start: '09:00' }) }))).toContain('오늘 당번 없음 · 전원 09:00');
    expect(M2._atMeHtml(me({ today_cell: cell({ no_duty: true, start: '09:00' }) }))).toContain('오늘 당번 없음 · 전원 09:00');
  });

  it('홈 카드: 찍은 뒤 — 시각과 지각', () => {
    const h = M2._atHomeCardHtml(me({ today_cell: cell({ duty: true, start: '09:00', check_in: '09:05', late: true }) }));
    expect(h).not.toContain('haPunch');
    expect(h).toContain('<b>09:05</b>');
    expect(h).toContain('ha-pill late">지각');
    expect(h).toContain('오늘 당번 · 09:00');
  });

  it('홈 카드: 주말엔 버튼 없음, 실패 응답이면 빈 문자열', () => {
    expect(M2._atHomeCardHtml(me({ weekday: false }))).not.toContain('haPunch');
    expect(M2._atHomeCardHtml(me({ weekday: false }))).toContain('주말');
    expect(M2._atHomeCardHtml({ error: '세션 로그인 후 사용해주세요', _status: 400 })).toBe('');
    expect(M2._atHomeCardHtml(null)).toBe('');
  });

  it('홈 카드: 받은 교체 요청은 띠로', () => {
    const h = M2._atHomeCardHtml(me({ swaps: { received: [{ id: 1, from_name: '김가영', duty_date: '2026-10-07' }, { id: 2, from_name: '최다인', duty_date: '2026-10-08' }], sent: [] } }));
    expect(h).toContain('ha-band');
    expect(h).toContain('김가영 님이 10/7(수) 당번 교체를 요청했어요 외 1건');
    expect(h.indexOf('ha-band')).toBeLessThan(h.indexOf('ha-card'));
  });

  it('내 근태: 받은 요청이 맨 위, 내 당번 날은 요일 칩, 요청 중인 날은 회색', () => {
    const d = me({ swaps: { received: [{ id: 1, from_name: '김가영', duty_date: '2026-10-07', reason: '병원' }], sent: [{ id: 5, status: 'pending', duty_date: '2026-10-13', to_name: '최다인' }] } });
    const h = M2._atMeHtml(d, null, '');
    expect(h.indexOf('at-band')).toBeLessThan(h.indexOf('at-me-card'));
    expect(h).toContain('_atMeSwapRespond(1,true)');
    expect(h).toContain('aria-label="10/12(월) 교체 요청"');
    expect(h).toContain('class="at-chip wait"');           // 10/13 요청 중
    expect(h).not.toContain('aria-label="10/13(화) 교체 요청"');
    expect(h).toContain('_atMeSwapCancel(5)');
  });

  it('내 근태: 연차 미확정이면 신청 버튼이 없다', () => {
    const h = M2._atMeHtml(me({ leave: { year: 2026, days: null, approved: 0, pending: 0, remaining: null, requests: [] } }), null, '');
    expect(h).toContain('확정하지 않았어요');
    expect(h).not.toContain('_atMeOpenLeave');
  });

  it('내 근태: 교체 폼은 동료 select, 연차 폼은 당번 거부 시 교체 바로가기', () => {
    const sw = M2._atMeHtml(me(), { kind: 'swap', date: '2026-10-12' }, '');
    expect(sw).toContain('id="atSwTo"');
    expect(sw).toContain('<option value="11">김가영</option>');
    expect(sw).toContain('class="at-chip on"');
    const lv = M2._atMeHtml(me(), { kind: 'leave', dates: ['2026-10-12'] }, '10/12(월) 은 당번입니다. 먼저 교체를 잡아주세요');
    expect(lv).toContain('at-err');
    expect(lv).not.toContain('교체 요청하기');   // duty_date 없으면 폼 안 바로가기 없음 (당번 칩의 onclick 과는 별개)
    const lv2 = M2._atMeHtml(me(), { kind: 'leave', duty_date: '2026-10-12' }, '당번');
    expect(lv2).toContain('10/12(월) 교체 요청하기');
  });

  /* 사장님: "연차 시작일·종료일 … 걍 달력 들어가서 체크체크 — 한번에 뛰엄뛰엄 두곳 들어갈 수 있음" */
  it('내 근태: 연차는 달력에서 날을 눌러 고른다 — 떨어진 날도 한 번에, 주말·지난 날·이미 신청한 날은 못 누른다', () => {
    const d = me({ leave: { year: 2026, days: 15, approved: 1, pending: 1, remaining: 14,
      requests: [{ id: 9, leave_date: '2026-10-20', status: 'pending', review_note: null }, { id: 8, leave_date: '2026-10-21', status: 'rejected', review_note: '바쁨' }] } });
    const h = M2._atMeHtml(d, { kind: 'leave', dates: ['2026-10-23', '2026-10-12'] }, '');
    expect(h).toContain('2026년 10월');
    expect(h).not.toContain('id="atLvFrom"');                                                 // 시작일/종료일 입력 없음
    expect(h).toContain('class="at-cal-d on duty" onclick="_atLvToggle(\'2026-10-12\')"');   // 고른 날 + 내 당번 점
    expect(h).toContain('class="at-cal-d on" onclick="_atLvToggle(\'2026-10-23\')"');        // 떨어진 날도 같이
    expect(h).toContain('class="at-cal-d today" onclick="_atLvToggle(\'2026-10-05\')"');
    expect(h).toContain('<span class="at-cal-d taken wait" title="승인 대기">20</span>');    // 이미 신청한 날은 못 누름
    expect(h).toContain("_atLvToggle('2026-10-21')");                                        // 반려된 날은 다시 신청 가능
    expect(h).not.toContain("_atLvToggle('2026-10-01')");                                    // 지난 날
    expect(h).not.toContain("_atLvToggle('2026-10-03')");                                    // 토요일
    expect(h).toContain('<b>2일</b> 선택');
    expect(h).toContain('10/12(월) ×');
    expect(h).toContain('10/12(월) 은 내 당번');
    expect(h).toContain('잔여 13일');                                                         // 14 − 대기 1
    expect(h).toContain('onclick="_atLvMonth(1)"');
    expect(h).toContain('onclick="_atLvMonth(-1)" aria-label="이전 달" disabled');            // 이번 달 아래로는 못 감
  });

  /* 사장님: "법정공휴일은 체크 안되나" / "직원 본인도 본인 건 언제 쓰는지 볼 수 있도록" */
  it('내 근태: 공휴일은 빨강으로 못 누르고, 내 연차 달력(보기 전용)에 승인·대기가 월별로 묶여 보인다', () => {
    const d = me({
      holidays: { '2026-10-09': '한글날', '2026-10-05': '개천절 대체공휴일' },
      leave: { year: 2026, days: 15, approved: 2, pending: 1, remaining: 13,
        requests: [{ id: 1, leave_date: '2026-10-20', status: 'approved', review_note: null }, { id: 2, leave_date: '2026-09-10', status: 'approved', review_note: null },
          { id: 3, leave_date: '2026-11-03', status: 'pending', review_note: null }] },
    });
    /* 신청 폼: 공휴일은 span.holi, 버튼 아님 */
    const pick = M2._atMeHtml(d, { kind: 'leave', dates: [] }, '');
    expect(pick).toContain('<span class="at-cal-d holi" title="한글날">9</span>');
    expect(pick).toContain('class="at-cal-d holi today" title="개천절 대체공휴일"');   // 오늘(10/5)이 공휴일
    expect(pick).not.toContain("_atLvToggle('2026-10-09')");
    expect(pick).toContain('공휴일: 5일 개천절 대체공휴일, 9일 한글날');
    /* 보기 전용 달력: 폼이 닫혀 있을 때, 승인=보라 대기=연보라, 누르는 버튼 없음, 월별 묶음 */
    const view = M2._atMeHtml(d, null, '');
    expect(view).toContain('내 연차 달력');
    expect(view).toContain('<span class="at-cal-d taken" title="승인된 연차">20</span>');
    expect(view).not.toContain('_atLvToggle(');
    expect(view).toContain('onclick="_atLvViewMonth(-1)"');
    expect(view).toContain('10/20(화)');
    expect(view).toContain('11/3(화) 대기');
    expect(view).toContain('9월</span>');     // 지난 달 승인 건도 묶음에 (9/10)
    expect(view).toContain('9/10(목)');
    expect(view).toContain('10/20(화)</span></span><span style="color:var(--text-mute)">1일');
  });

  it('연차 부여 탭: 공휴일 표 — 법정·대체는 못 지우고 등록분만 삭제, 추가 폼은 사장님만', () => {
    const base = {
      year: 2026, settings, rows: [{ id: 11, name: '가', tracked: true, hire_date: '2023-03-02', suggested: 16, basis: 'x', days: 16, approved: 0, pending: 0, remaining: 16, requests: [] }],
      holidays: [{ ymd: '2026-02-17', name: '설날', source: 'seed', sub_rule: 'sunday' }, { ymd: '2026-10-05', name: '개천절 대체공휴일', source: 'substitute', sub_rule: null },
        { ymd: '2026-10-09', name: '한글날', source: 'fixed', sub_rule: null }, { ymd: '2026-10-30', name: '창립기념일', source: 'owner', sub_rule: null }],
    };
    const own = M._atGrantHtml({ ...base, owner: true });
    expect(own).toContain('2026년 공휴일');
    expect(own).toContain('<b>한글날</b><span class="pill gray">법정</span>');
    expect(own).toContain('<b>개천절 대체공휴일</b><span class="pill gray">대체</span>');
    expect(own).toContain("_atHolidayDel('2026-02-17')");
    expect(own).toContain("_atHolidayDel('2026-10-30')");
    expect(own).not.toContain("_atHolidayDel('2026-10-09')");
    expect(own).toContain('id="atHolYmd"');
    const viewer = M._atGrantHtml({ ...base, owner: false });
    expect(viewer).toContain('한글날');
    expect(viewer).not.toContain('_atHolidayDel');
    expect(viewer).not.toContain('atHolYmd');
  });

  it('오늘이 공휴일이면 홈 카드·내 근태에 이름이 뜬다', () => {
    const d = me({ weekday: false, holiday: '한글날', today: '2026-10-09' });
    expect(M2._atHomeCardHtml(d)).toContain('오늘은 공휴일입니다 (한글날)');
    expect(M2._atHomeCardHtml(d)).not.toContain('haPunch');
    expect(M2._atMeHtml(d, null, '')).toContain('오늘은 공휴일입니다 (한글날)');
  });

  it('탭: 직원은 내 근태·당번표만, 사장님은 오늘·월별·승인함·부여까지', () => {
    expect(M2._atTabList(false, true).map((t: string[]) => t[0])).toEqual(['me', 'duty']);
    expect(M2._atTabList(true, false).map((t: string[]) => t[0])).toEqual(['today', 'month', 'duty', 'leave', 'grant']);
    expect(M2._atTabsHtml('me', 3, false, true, 2)).toContain('내 근태<span class="n">2</span>');
    expect(M2._atTabsHtml('me', 3, false, true, 2)).not.toContain('오늘');
    expect(M2._atTabsHtml('today', 3, true, false, 0)).toContain('연차 승인함<span class="n">3</span>');
  });
});

/* 사장님: "연차는 누가 몇 개 남았고 언제 썼고 이런 걸 개별로 좀 보면 좋겠네" */
describe('연차 현황·부여 — 사람별 내역', () => {
  const src = readFileSync('admin-attend.js', 'utf8');
  const M3 = new Function('setTimeout', 'setInterval', 'fetch', 'document', 'location',
    src + '\n_atGrantOpen[11] = true;\nreturn { _atGrantHtml, _atLeaveDetailHtml };')(
    () => 0, () => 0, () => Promise.reject(new Error('no fetch')),
    { addEventListener: () => {}, getElementById: () => null, querySelector: () => null }, { origin: 'https://x.test' },
  ) as Record<string, (...a: unknown[]) => any>;
  const row = (id: number, name: string, requests: unknown[]) => ({
    id, name, hire_date: '2023-03-02', tracked: true, suggested: 16, basis: 'x', days: 16, approved: 2, pending: 1, remaining: 14, requests,
  });
  const reqs = [
    { id: 1, leave_date: '2026-10-15', status: 'pending', reason: '가족 행사', requested_at: '2026-10-01 09:00:00', reviewed_at: null, review_note: null },
    { id: 2, leave_date: '2026-10-02', status: 'approved', reason: '병원', requested_at: '2026-09-28 10:00:00', reviewed_at: '2026-09-28 11:00:00', review_note: null },
    { id: 3, leave_date: '2026-09-10', status: 'approved', reason: null, requested_at: '2026-09-01 10:00:00', reviewed_at: '2026-09-01 11:00:00', review_note: null },
    { id: 4, leave_date: '2026-08-20', status: 'rejected', reason: '여행', requested_at: '2026-08-01 10:00:00', reviewed_at: '2026-08-02 11:00:00', review_note: '신고 마감 주' },
  ];

  it('펼치면 쓴 날짜·대기·반려가 날짜별로 보인다', () => {
    const h = M3._atGrantHtml({ owner: true, year: 2026, settings, rows: [row(11, '김가영', reqs), row(12, '박나래', [reqs[1]])] });
    expect(h).toContain('내역 ▾');                       // 박나래 (닫힘, 내역 있음)
    expect(h).toContain('접기 ▴');                       // 김가영 (열림)
    expect(h).toContain('쓴 날: 9/10(목), 10/2(금)');
    expect(h).toContain('10/15(목)');
    expect(h).toContain('pill late">반려');
    expect(h).toContain('신고 마감 주');
    /* 열린 행에서 바로 승인·취소 */
    expect(h).toContain('_atReview(1,true)');
    expect(h).toContain('_atLeaveCancel(2)');
  });

  it('내역이 없으면 토글 자체가 없다', () => {
    const h = M3._atGrantHtml({ owner: true, year: 2026, settings, rows: [row(12, '박나래', [])] });
    expect(h).not.toContain('_atGrantToggle(12)');
  });

  it('사장님이 아니면 상세에 승인·취소 버튼이 없다', () => {
    const h = M3._atLeaveDetailHtml(row(11, '김가영', reqs), false);
    expect(h).toContain('10/2(금)');
    expect(h).not.toContain('_atReview(');
    expect(h).not.toContain('_atLeaveCancel(');
  });
});
