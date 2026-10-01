/**
 * 근태·당번·연차 — 순수 로직 (DB 없음).
 *
 * 2026-10-01 사장님:
 *   "직원들 근태 체크하게 출근시간 … 바로 찍을수있는거"
 *   "연차도 같이 넣는 시스템으로 간다. 직원은 관리자에 있음 직원이다"
 *   "3명중 1명은 9시 나머지는 9시30분출근 한주단위로 당번 … 지들끼리 교체도 가능해야할듯 당번때 연차면.."
 *   "퇴근찍는건 안해도된다 출근만 찍자" / "1분까진 봐준다고 하자"
 *
 * 판정(당번·지각·잔여)은 저장하지 않고 여기서 매번 계산한다 — 기준을 나중에 바꿔도
 * 저장된 값과 화면이 어긋날 수 없다. attendance.js 는 DB 를 읽어 이 함수들에 넘기기만 한다.
 *
 * 날짜는 전부 'YYYY-MM-DD' 문자열(KST 달력 날짜). 내부 계산은 UTC 자정 기준 ms 로 해서
 * 실행 환경의 시간대와 무관하게 한다.
 */

const DAY = 86400000;

export function validYmd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const ms = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}
export function validHm(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
}
function ms(ymd) { return Date.parse(ymd + 'T00:00:00Z'); }
function ymd(t) { return new Date(t).toISOString().slice(0, 10); }

export function addDays(d, n) { return ymd(ms(d) + n * DAY); }
/** 0=일 … 6=토 */
export function weekday(d) { return new Date(ms(d)).getUTCDay(); }
export function isWeekday(d) { const w = weekday(d); return w >= 1 && w <= 5; }
export function mondayOf(d) { const w = weekday(d); return addDays(d, w === 0 ? -6 : 1 - w); }

/** from~to (포함) 사이의 평일. 실수로 1년치를 넣는 것을 막으려고 62일로 자른다. */
export function weekdaysBetween(from, to) {
  if (!validYmd(from) || !validYmd(to) || from > to) return [];
  const out = [];
  for (let d = from, i = 0; d <= to && i < 62; d = addDays(d, 1), i++) if (isWeekday(d)) out.push(d);
  return out;
}

/* ───────────── 당번 ───────────── */

/**
 * 그 주(월요일)에 유효한 순서 버전.
 * 순서를 바꾸면 새 버전이 "적용 시작 월요일" 과 함께 쌓인다 — 지난 주 당번이 바뀌지 않게.
 * 같은 날짜로 여러 번 저장했으면 나중 것(id 큰 것)이 이긴다.
 */
export function rotationFor(monday, rotations) {
  let best = null;
  for (const r of rotations || []) {
    if (!r || !validYmd(r.effective_from) || r.effective_from > monday) continue;
    if (!best || r.effective_from > best.effective_from
        || (r.effective_from === best.effective_from && (r.id || 0) > (best.id || 0))) best = r;
  }
  return best;
}

/** 순서만으로 정해지는 그 주의 당번 (하루 교체 반영 전) */
export function weeklyDuty(d, rotations) {
  if (!validYmd(d) || !isWeekday(d)) return null;
  const monday = mondayOf(d);
  const ver = rotationFor(monday, rotations);
  if (!ver || !Array.isArray(ver.members) || !ver.members.length) return null;
  const weeks = Math.round((ms(monday) - ms(ver.effective_from)) / (7 * DAY));
  const n = ver.members.length;
  return ver.members[((weeks % n) + n) % n];
}

/**
 * 그날 실제 당번 = 하루 덮어쓰기(사장님 지정·교체 수락) > 주 순서.
 * overrides: { 'YYYY-MM-DD': user_id }
 */
export function dutyFor(d, rotations, overrides) {
  if (!validYmd(d) || !isWeekday(d)) return null;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, d) && overrides[d] != null) return Number(overrides[d]);
  const w = weeklyDuty(d, rotations);
  return w == null ? null : Number(w);
}

/* ───────────── 지각 ───────────── */

export function hmToMin(hm) {
  const m = String(hm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 그날 내 기준 출근시각 — 당번이면 duty_start(09:00), 아니면 normal_start(09:30) */
export function expectedStart(isDuty, settings) {
  const s = settings || {};
  return isDuty ? (s.duty_start || '09:00') : (s.normal_start || '09:30');
}

/**
 * 지각 여부. 출근시각은 "분 단위로 버림" — 화면에 보이는 HH:MM 과 판정이 같아야 한다
 * (09:01:59 는 화면에 09:01 로 보이니 1분 유예 안이다).
 * checkInAt: 'YYYY-MM-DD HH:MM:SS' 또는 'HH:MM'
 */
export function isLate(checkInAt, start, graceMinutes) {
  if (!checkInAt) return false;
  const hm = String(checkInAt).length > 8 ? String(checkInAt).slice(11, 16) : String(checkInAt).slice(0, 5);
  const t = hmToMin(hm);
  const s = hmToMin(start);
  if (t == null || s == null) return false;
  const g = Number.isFinite(Number(graceMinutes)) ? Math.max(0, Number(graceMinutes)) : 1;
  return t > s + g;
}

/* ───────────── 교체 ───────────── */

/**
 * 교체 요청 검사. 문제 없으면 null, 있으면 사람이 읽을 문장.
 *   ctx.dutyOf(date) → 그날 현재 당번 user_id
 *   ctx.staffIds     → 근태 대상 직원 id 배열
 */
export function checkSwapRequest({ fromUser, toUser, dutyDate, returnDate, today, dutyOf, staffIds }) {
  if (!validYmd(dutyDate)) return '날짜가 올바르지 않습니다';
  if (!isWeekday(dutyDate)) return '주말에는 당번이 없습니다';
  if (dutyDate < today) return '지난 날짜는 교체할 수 없습니다';
  if (!toUser || Number(toUser) === Number(fromUser)) return '교체할 동료를 골라주세요';
  if (!(staffIds || []).map(Number).includes(Number(toUser))) return '근태 대상 직원이 아닙니다';
  if (Number(dutyOf(dutyDate)) !== Number(fromUser)) return fmtMd(dutyDate) + ' 은 내 당번이 아닙니다';
  if (returnDate) {
    if (!validYmd(returnDate) || !isWeekday(returnDate)) return '맞교환 날짜가 올바르지 않습니다';
    if (returnDate < today) return '맞교환 날짜가 지났습니다';
    if (returnDate === dutyDate) return '맞교환 날짜가 같은 날입니다';
    if (Number(dutyOf(returnDate)) !== Number(toUser)) return fmtMd(returnDate) + ' 은 상대방 당번이 아닙니다';
  }
  return null;
}

/**
 * 수락 시 재검사 — 요청 이후 사장님이 당번을 바꿨거나 연차가 잡혔을 수 있다.
 *   ctx.hasLeave(userId, date) → 그날 대기·승인 연차가 있는지
 */
export function checkSwapAccept({ swap, today, dutyOf, staffIds, hasLeave }) {
  const err = checkSwapRequest({
    fromUser: swap.from_user, toUser: swap.to_user, dutyDate: swap.duty_date,
    returnDate: swap.return_date, today, dutyOf, staffIds,
  });
  if (err) return '교체할 수 없게 됐습니다 — ' + err;
  if (hasLeave(swap.to_user, swap.duty_date)) return fmtMd(swap.duty_date) + ' 에 연차가 있어 대신 설 수 없습니다';
  if (swap.return_date && hasLeave(swap.from_user, swap.return_date)) return '요청한 분이 ' + fmtMd(swap.return_date) + ' 에 연차가 있습니다';
  return null;
}

/* ───────────── 연차 ───────────── */

/**
 * 연차 신청 검사. 문제 없으면 { dates } (정리된 평일 목록), 있으면 { error }.
 *   grant: { days } | null (null = 사장님 확정 전)
 *   used:  그 해 승인 + 대기 일수 (대기도 세야 여러 건으로 잔여를 넘기지 못한다)
 *   taken: 이미 대기·승인된 날짜 Set
 */
export function checkLeaveRequest({ userId, dates, today, dutyOf, grant, used, taken }) {
  const list = Array.from(new Set((dates || []).map(String))).sort();
  if (!list.length) return { error: '날짜를 골라주세요' };
  if (list.length > 31) return { error: '한 번에 31일까지만 신청할 수 있습니다' };
  for (const d of list) {
    if (!validYmd(d)) return { error: '날짜가 올바르지 않습니다' };
    if (!isWeekday(d)) return { error: fmtMd(d) + ' 은 주말입니다' };
    if (d < today) return { error: '지난 날짜는 신청할 수 없습니다' };
  }
  const year = list[0].slice(0, 4);
  if (list.some((d) => d.slice(0, 4) !== year)) return { error: '연도가 바뀌는 신청은 나눠서 해주세요' };
  if (!grant) return { error: year + '년 연차가 아직 확정되지 않았습니다 (사장님 확정 후 신청 가능)' };
  const dup = list.find((d) => taken && taken.has(d));
  if (dup) return { error: fmtMd(dup) + ' 은 이미 신청돼 있습니다' };
  /* 당번 날 연차 = 대타 먼저 (사장님: "당번때 연차면..") */
  const duty = list.find((d) => Number(dutyOf(d)) === Number(userId));
  if (duty) return { error: fmtMd(duty) + ' 은 당번입니다. 먼저 교체를 잡아주세요', duty_date: duty };
  const left = Number(grant.days) - Number(used || 0);
  if (list.length > left) return { error: '잔여 연차(' + fmtDays(left) + ')보다 많이 신청했습니다' };
  return { dates: list };
}

/** 승인 시 재검사 — 대기가 여러 건이면 승인 순서에 따라 잔여를 넘길 수 있고, 당번이 다시 돌아왔을 수 있다 */
export function checkLeaveApprove({ userId, date, dutyOf, grant, approved }) {
  if (!grant) return date.slice(0, 4) + '년 연차가 확정되지 않았습니다';
  if (Number(dutyOf(date)) === Number(userId)) return fmtMd(date) + ' 은 이 직원이 당번입니다 — 교체가 먼저입니다';
  if (Number(approved || 0) + 1 > Number(grant.days)) return '잔여 연차가 없습니다';
  return null;
}

function addMonths(d, n) {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return ymd(t.getTime());
}

/**
 * 연차 제안값 (회계연도 1/1~12/31 기준). 사장님이 확정해야 실제 부여된다.
 *
 * ⚠ 근로기준법 제60조 + 고용노동부 회계연도 환산 행정해석을 기억으로 옮긴 것이다
 *   (작성 세션에서 국가법령정보센터 접속이 막혀 원문 대조를 못 했다). 그래서 값 옆에
 *   계산근거를 같이 돌려주고, 화면에서 사장님이 확정·조정하게 했다.
 *   - ②항 1년 미만: 1개월 개근마다 1일, 최대 11일 (입사일로부터 m개월째 되는 날 발생)
 *   - ①항 15일 / ④항 3년 이상 최초 1년 초과 매 2년 1일 가산, 25일 한도
 *   - (구)③항 1년 미만 사용분 차감 — 2018.5.29 삭제, 차감 안 함
 *   - 입사 다음 해: 15 × (전년도 재직일수 ÷ 365) 비례 + 입사 1년 전까지 남은 월 1일
 *   - 근속연수는 입사한 해를 1년으로 센다 (Y − 입사연도). 입사일 기준보다 불리하지 않게.
 *   - 80% 출근율, 5인 미만 적용 제외, 퇴사 정산은 판단하지 않는다.
 */
export function suggestLeave(hireDate, year) {
  if (!validYmd(hireDate) || !Number.isInteger(Number(year))) return null;
  const Y = Number(year);
  const hy = Number(hireDate.slice(0, 4));
  if (Y < hy) return { days: 0, basis: hireDate + ' 입사 — 입사 전 연도' };

  /* 입사 1년 미만 구간의 월 1일이 Y 년 안에 몇 번 생기는지 (②항, 최대 11) */
  let monthly = 0;
  for (let m = 1; m <= 11; m++) {
    const d = addMonths(hireDate, m);
    if (Number(d.slice(0, 4)) === Y) monthly++;
  }

  if (Y === hy) {
    return { days: monthly, basis: hireDate + ' 입사 · 입사한 해 — 1개월 개근마다 1일 × ' + monthly };
  }
  if (Y === hy + 1) {
    const worked = Math.round((ms(hy + '-12-31') - ms(hireDate)) / DAY) + 1;
    const prorated = Math.round((15 * worked / 365) * 10) / 10;
    const days = Math.round((prorated + monthly) * 10) / 10;
    return {
      days,
      basis: hireDate + ' 입사 · 입사 다음 해 — 15일 × ' + worked + '/365 = ' + fmtDays(prorated)
        + (monthly ? ' + 입사 1년 전까지 월 1일 × ' + monthly : ''),
    };
  }
  const n = Y - hy;
  const add = Math.floor((n - 1) / 2);
  const days = Math.min(25, 15 + add);
  return {
    days,
    basis: hireDate + ' 입사 · ' + Y + '년 근속 ' + n + '년차 → 15일'
      + (add ? ' + 가산 ' + add + '일' : '') + (15 + add > 25 ? ' (25일 한도)' : '') + ' = ' + days + '일',
  };
}

/* ───────────── CSV ───────────── */

export function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** 엑셀이 UTF-8 CSV 를 깨지 않게 BOM, 줄바꿈은 CRLF */
export function buildCsv(header, rows) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

/* ───────────── 표시 ───────────── */

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtMd(d) {
  return Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) + '(' + WD[weekday(d)] + ')';
}
export function fmtDays(n) {
  const v = Math.round(Number(n || 0) * 10) / 10;
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + '일';
}
