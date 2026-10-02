/**
 * 🕘 직원 근태 · 당번 · 연차 (2026-10-01)
 *
 * 직원 = 사용자 탭 👑 관리자 (users.is_admin = 1). 사장님이 staff_profiles.tracked=0 으로
 * 근태 명단에서 뺄 수 있다. 이 파일은 users 의 권한·status 컬럼을 읽기만 한다
 * (루트 CLAUDE.md — 권한·status 자동 변경 금지).
 *
 * 판정 로직은 전부 _attendance-core.js (순수함수, 테스트로 고정). 여기는 DB 입출력만.
 *
 * GET  ?view=me                                  본인 화면 (attend.html)
 * GET  ?view=duty&from=YYYY-MM-DD&weeks=N        당번표 + 교체 기록       (👑 관리자 누구나 — 교체에 필요)
 * GET  ?view=today                               오늘 전원              (owner)
 * GET  ?view=month&month=YYYY-MM[&format=csv]    월별 / CSV             (owner)
 * GET  ?view=leave&year=YYYY                     연차 부여·사용·대기      (owner)
 * GET  ?view=badge                               사이드바 뱃지 (승인 대기 · 나에게 온 교체)
 *
 * POST ?action=punch                                          출근 (본인)
 * POST ?action=swap_request  {to_user, duty_date, return_date?, reason}   (본인)
 * POST ?action=swap_respond  {id, accept}                     받은 사람 본인
 * POST ?action=swap_cancel   {id}                             요청자 본인
 * POST ?action=leave_request {dates:[…], reason}              (본인)
 * POST ?action=leave_cancel  {id}                             본인 대기 건 / owner 는 승인 건도
 * POST ?action=leave_review  {id, approve, note}              owner
 * POST ?action=leave_grant   {user_id, year, days}            owner
 * POST ?action=profile       {user_id, hire_date?, tracked?}  owner
 * POST ?action=rotation      {members:[…], effective_from}    owner
 * POST ?action=duty_set      {duty_date, user_id | clear, force?}  owner
 * POST ?action=duty_set_week {monday, user_id | clear, force?}     owner  — 월~금 5칸 일괄
 * POST ?action=edit          {user_id, work_date, check_in?: 'HH:MM'|null, note?}  owner
 * POST ?action=leave_review_many {ids[], approve, note?}  owner  — 묶음 승인·반려 ({done, failed[]})
 * POST ?action=settings      {duty_start, normal_start}  owner  (유예는 2026-10-02 폐지 — 항상 0)
 * GET  ?view=holidays&year=YYYY                   그 해 공휴일 표 (법정·등록·대체)   (직원도)
 * POST ?action=holiday_add   {ymd, name, sub?}    owner  — 음력 명절·선거일·임시공휴일 등록
 * POST ?action=holiday_del   {ymd}                owner
 */

import { checkAdmin, adminUnauthorized, ownerOnly, checkOriginCsrf } from "./_adminAuth.js";
import { logAudit } from "./_audit.js";
import {
  validYmd, validHm, addDays, isWeekday, mondayOf, weekdaysBetween,
  holidayMap, isWorkday, workdaysBetween, HOLIDAY_SUB_RULES,
  dutyFor, startFor, noDutyDay, isLate,
  checkSwapRequest, checkSwapAccept, checkLeaveRequest, checkLeaveApprove,
  suggestLeave, buildCsv, fmtMd,
} from "./_attendance-core.js";

const KST_OFFSET = 9 * 60 * 60 * 1000;
function kst() { return new Date(Date.now() + KST_OFFSET).toISOString().replace('T', ' ').substring(0, 19); }
function todayKST() { return kst().substring(0, 10); }
const json = (o, status) => Response.json(o, status ? { status } : undefined);
const bad = (msg, status = 400) => json({ error: msg }, status);

/* migrations/0003_staff_attendance.sql 과 같은 DDL. 사장님이 migration 을 안 돌려도
   첫 호출에 생기고, 나중에 돌려도 IF NOT EXISTS 라 충돌하지 않는다. */
async function ensureTables(db) {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS staff_profiles (
      user_id INTEGER PRIMARY KEY, hire_date TEXT, tracked INTEGER NOT NULL DEFAULT 1, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS staff_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, work_date TEXT NOT NULL,
      check_in_at TEXT, note TEXT, edited_by INTEGER, edited_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_att_user_date ON staff_attendance(user_id, work_date)`,
    `CREATE TABLE IF NOT EXISTS staff_duty_rotation (
      id INTEGER PRIMARY KEY AUTOINCREMENT, effective_from TEXT NOT NULL, members TEXT NOT NULL,
      created_by INTEGER, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS staff_duty_overrides (
      duty_date TEXT PRIMARY KEY, user_id INTEGER NOT NULL, source TEXT NOT NULL,
      swap_id INTEGER, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS staff_duty_swaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT, from_user INTEGER NOT NULL, to_user INTEGER NOT NULL,
      duty_date TEXT NOT NULL, return_date TEXT, reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT NOT NULL, responded_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS staff_leave_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, year INTEGER NOT NULL,
      auto_days REAL, days REAL NOT NULL, basis TEXT,
      confirmed_by INTEGER, confirmed_at TEXT, updated_at TEXT)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_user_year ON staff_leave_grants(user_id, year)`,
    `CREATE TABLE IF NOT EXISTS staff_leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, leave_date TEXT NOT NULL, reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT NOT NULL,
      reviewed_by INTEGER, reviewed_at TEXT, review_note TEXT)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_user_date_active
      ON staff_leave_requests(user_id, leave_date) WHERE status IN ('pending','approved')`,
    `CREATE TABLE IF NOT EXISTS staff_attendance_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), duty_start TEXT DEFAULT '09:00',
      normal_start TEXT DEFAULT '09:30', grace_minutes INTEGER DEFAULT 0, updated_at TEXT)`,
    `INSERT OR IGNORE INTO staff_attendance_settings (id) VALUES (1)`,
    /* 공휴일 등록분 (음력 명절 · 선거일 · 임시공휴일). 날짜 고정 공휴일·대체공휴일은 코드가 계산한다 (_attendance-core.js holidayMap) */
    `CREATE TABLE IF NOT EXISTS staff_holidays (
      ymd TEXT PRIMARY KEY, name TEXT NOT NULL, sub TEXT, source TEXT NOT NULL DEFAULT 'owner', created_at TEXT)`,
    `ALTER TABLE staff_attendance_settings ADD COLUMN holidays_seeded INTEGER DEFAULT 0`,
  ];
  for (const sql of ddl) { try { await db.prepare(sql).run(); } catch (_) {} }
  await seedHolidays(db);
}

/* 2026 음력 명절 + 지방선거일 — 한 번만 넣고, 그 뒤엔 사장님이 지우거나 바꿔도 다시 안 넣는다.
   2027 이후 음력 날짜는 사장님이 [연차 부여] 탭에서 등록 (코드로 못 구한다). */
const SEED_HOLIDAYS_2026 = [
  ['2026-02-16', '설날 연휴', 'sunday'], ['2026-02-17', '설날', 'sunday'], ['2026-02-18', '설날 연휴', 'sunday'],
  ['2026-05-24', '부처님오신날', 'weekend'],
  ['2026-06-03', '제9회 전국동시지방선거', null],
  ['2026-09-24', '추석 연휴', 'sunday'], ['2026-09-25', '추석', 'sunday'], ['2026-09-26', '추석 연휴', 'sunday'],
];
async function seedHolidays(db) {
  try {
    const s = await db.prepare(`SELECT holidays_seeded FROM staff_attendance_settings WHERE id = 1`).first();
    if (s && Number(s.holidays_seeded) === 1) return;
    const now = kst();
    await db.batch(SEED_HOLIDAYS_2026.map(([ymd, name, sub]) =>
      db.prepare(`INSERT OR IGNORE INTO staff_holidays (ymd, name, sub, source, created_at) VALUES (?, ?, ?, 'seed', ?)`).bind(ymd, name, sub, now)));
    await db.prepare(`UPDATE staff_attendance_settings SET holidays_seeded = 1 WHERE id = 1`).run();
  } catch (_) {}
}

/** from~to 가 걸친 연도의 공휴일 표 (고정 + 등록 + 대체). names 는 화면용 { ymd: 이름 } */
async function loadHolidays(db, from, to) {
  const y0 = Number(String(from).slice(0, 4)), y1 = Number(String(to).slice(0, 4));
  const { results } = await db.prepare(`SELECT ymd, name, sub, source FROM staff_holidays WHERE ymd BETWEEN ? AND ?`)
    .bind(y0 + '-01-01', y1 + '-12-31').all();
  const rows = results || [];
  const map = {};
  for (let y = y0; y <= y1 && y <= y0 + 3; y++) Object.assign(map, holidayMap(y, rows));
  const names = {};
  for (const d of Object.keys(map)) names[d] = map[d].name;
  return { map, names, rows };
}

/* ── 읽기 헬퍼 ── */

async function loadStaff(db) {
  const { results } = await db.prepare(
    `SELECT u.id, COALESCE(u.real_name, u.name, 'ID#' || u.id) AS name, p.hire_date
       FROM users u LEFT JOIN staff_profiles p ON p.user_id = u.id
      WHERE u.is_admin = 1 AND COALESCE(p.tracked, 1) = 1
      ORDER BY u.id ASC LIMIT 50`
  ).all();
  return (results || []).map((r) => ({ id: Number(r.id), name: r.name, hire_date: r.hire_date || null }));
}

async function loadSettings(db) {
  const s = await db.prepare(`SELECT duty_start, normal_start FROM staff_attendance_settings WHERE id = 1`).first();
  return {
    duty_start: (s && s.duty_start) || '09:00',
    normal_start: (s && s.normal_start) || '09:30',
    /* 2026-10-02 사장님 "1분 유예도 빼버리자 그냥" — 유예 없음. 컬럼은 남겨두되 읽지 않는다 (prod 행에 1 이 들어 있어도 무시) */
    grace_minutes: 0,
  };
}

async function loadRotations(db) {
  const { results } = await db.prepare(`SELECT id, effective_from, members FROM staff_duty_rotation ORDER BY effective_from, id`).all();
  return (results || []).map((r) => {
    let members = [];
    try { members = JSON.parse(r.members || '[]').map(Number).filter(Boolean); } catch (_) {}
    return { id: r.id, effective_from: r.effective_from, members };
  });
}

async function loadOverrides(db, from, to) {
  const { results } = await db.prepare(
    `SELECT duty_date, user_id, source, swap_id FROM staff_duty_overrides WHERE duty_date BETWEEN ? AND ?`
  ).bind(from, to).all();
  const map = {}, meta = {};
  for (const r of results || []) { map[r.duty_date] = Number(r.user_id); meta[r.duty_date] = r; }
  return { map, meta };
}

async function dutyCtx(db, from, to) {
  const rotations = await loadRotations(db);
  const { map, meta } = await loadOverrides(db, from, to);
  const hol = await loadHolidays(db, from, to);
  return {
    rotations, overrides: map, overrideMeta: meta, holidays: hol.map, holidayNames: hol.names,
    dutyOf: (d) => dutyFor(d, rotations, map, hol.map),
  };
}

/** 본인 확인 — 세션 로그인 + 👑 관리자 + 근태 대상 */
async function selfStaff(db, auth) {
  if (!auth.userId) return { error: '세션 로그인 후 사용해주세요 (관리자 비밀번호 접속으로는 본인 확인이 안 됩니다)', status: 400 };
  const u = await db.prepare(
    `SELECT u.id, u.is_admin, COALESCE(u.real_name, u.name) AS name, COALESCE(p.tracked, 1) AS tracked
       FROM users u LEFT JOIN staff_profiles p ON p.user_id = u.id WHERE u.id = ?`
  ).bind(auth.userId).first();
  if (!u || Number(u.is_admin) !== 1) return { error: '직원(관리자) 전용입니다', status: 403 };
  if (Number(u.tracked) === 0) return { error: '근태 대상이 아닙니다', status: 403 };
  return { id: Number(u.id), name: u.name };
}

async function leaveTaken(db, userId, year) {
  const { results } = await db.prepare(
    `SELECT leave_date, status FROM staff_leave_requests
      WHERE user_id = ? AND status IN ('pending','approved') AND substr(leave_date,1,4) = ?`
  ).bind(userId, String(year)).all();
  const rows = results || [];
  return {
    taken: new Set(rows.map((r) => r.leave_date)),
    approved: rows.filter((r) => r.status === 'approved').length,
    pending: rows.filter((r) => r.status === 'pending').length,
  };
}

async function grantOf(db, userId, year) {
  const g = await db.prepare(`SELECT days FROM staff_leave_grants WHERE user_id = ? AND year = ?`).bind(userId, Number(year)).first();
  return g ? { days: Number(g.days) } : null;
}

async function leaveMap(db, from, to, statuses) {
  const ph = statuses.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT user_id, leave_date, status FROM staff_leave_requests
      WHERE leave_date BETWEEN ? AND ? AND status IN (${ph})`
  ).bind(from, to, ...statuses).all();
  const m = {};
  for (const r of results || []) m[r.user_id + '|' + r.leave_date] = r.status;
  return m;
}

/** 그 해 공휴일 목록 — 화면용. source: fixed(법정 고정) | seed | owner | substitute(대체) */
async function holidayList(db, year) {
  const hol = await loadHolidays(db, year + '-01-01', year + '-12-31');
  const srcOf = Object.fromEntries(hol.rows.map((r) => [r.ymd, r.source]));
  const subOf = Object.fromEntries(hol.rows.map((r) => [r.ymd, r.sub || null]));
  return Object.keys(hol.map).sort().map((ymd) => ({
    ymd, name: hol.map[ymd].name,
    source: hol.map[ymd].sub ? 'substitute' : (srcOf[ymd] || 'fixed'),
    sub_rule: hol.map[ymd].sub ? null : (subOf[ymd] || null),
  }));
}

/** 그날 당번이 승인 연차라 안 나오는지 — lv: leaveMap 결과 */
function dutyAbsentOn(duty, date, lv) {
  return duty != null && lv[duty + '|' + date] === 'approved';
}

/** 하루 한 사람의 판정 묶음. opts: { workday, dutyAbsent } — 당번 없는 평일은 전원 당번 시각 (사장님 2026-10-02) */
function dayCell(userId, date, att, duty, leave, settings, opts) {
  const isDuty = duty === userId;
  const start = startFor(userId, duty, settings, opts);
  const ci = att ? att.check_in_at : null;
  return {
    duty: isDuty,
    no_duty: noDutyDay(duty, opts),   // 당번 없음·당번 연차 → 전원 duty_start 인 날
    start,
    check_in: ci ? ci.slice(11, 16) : null,
    late: ci ? isLate(ci, start, settings.grace_minutes) : false,
    leave: leave || null,          // 'approved' | 'pending' | null
    note: att ? att.note || null : null,
    /* edited_by 가 아니라 edited_at — 사장님 비번 접속이면 userId 가 없어 edited_by 가 0 이다 */
    edited: !!(att && att.edited_at),
  };
}

/* ───────────────────────── GET ───────────────────────── */

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return bad('DB error', 500);
  await ensureTables(db);

  const url = new URL(context.request.url);
  const view = url.searchParams.get('view') || 'me';
  const today = todayKST();

  try {
    if (view === 'me') return await viewMe(db, auth, today);
    /* 직원(👑 관리자, admin_role 무관)은 내 것 + 당번표만. 사장님: "지는 지꺼만 보게 해야 될 듯.
       나머지 직원이 지각했니 마니 하는 건 좋지 않다." 동료 출근시각·지각·연차 잔여는 owner 전용.
       화면에서만 숨기면 주소로 열리므로 여기서 막는다. 당번표는 교체에 필요하니 직원도 본다. */
    /* 사이드바 뱃지 — my_swaps = 나에게 온 교체 요청 (세션 직원만).
       pending_leave 는 사장님에게만 (직원이 동료 연차 신청 건수를 셀 이유가 없다). 연도 무관. */
    if (view === 'badge') {
      let pendingLeave = 0;
      if (auth.owner) {
        const r = await db.prepare(`SELECT COUNT(*) AS c FROM staff_leave_requests WHERE status = 'pending'`).first();
        pendingLeave = Number(r && r.c) || 0;
      }
      let mySwaps = 0;
      if (auth.userId) {
        const s = await db.prepare(`SELECT COUNT(*) AS c FROM staff_duty_swaps WHERE to_user = ? AND status = 'pending' AND duty_date >= ?`).bind(auth.userId, today).first();
        mySwaps = Number(s && s.c) || 0;
      }
      return json({ ok: true, owner: !!auth.owner, pending_leave: pendingLeave, my_swaps: mySwaps });
    }
    if (view === 'duty') return await viewDuty(db, auth, url, today);
    /* 그 해 공휴일 표 — 직원도 본다 (연차 달력·당번표에 쓴다) */
    if (view === 'holidays') {
      const year = Number(url.searchParams.get('year')) || Number(today.slice(0, 4));
      if (year < 2000 || year > 2100) return bad('year 확인');
      return json({ ok: true, year, owner: !!auth.owner, list: await holidayList(db, year) });
    }
    if (!auth.owner) return ownerOnly();
    if (view === 'today') return await viewToday(db, auth, today);
    if (view === 'month') return await viewMonth(db, auth, url, today);
    if (view === 'leave') return await viewLeave(db, auth, url, today);
    return bad('unknown view');
  } catch (e) {
    /* 에러 원문은 응답에 싣지 않는다 (packages/auth/CLAUDE.md 보안 규칙) */
    console.error('[attendance GET]', e);
    return bad('처리 중 오류가 발생했습니다', 500);
  }
}

async function viewMe(db, auth, today) {
  const me = await selfStaff(db, auth);
  if (me.error) return bad(me.error, me.status);
  const settings = await loadSettings(db);
  const staff = await loadStaff(db);
  const nameOf = Object.fromEntries(staff.map((s) => [s.id, s.name]));

  const thisMon = mondayOf(today);
  const horizon = addDays(thisMon, 7 * 6 - 1);
  const { dutyOf, holidays, holidayNames } = await dutyCtx(db, thisMon, horizon);
  /* 연차 달력용 — 올해 1월부터 1년 남짓 뒤까지의 공휴일 이름 (내 연차 달력은 지난 달도 본다) */
  const calHol = await loadHolidays(db, today.slice(0, 4) + '-01-01', addDays(today, 400));

  const att = await db.prepare(`SELECT * FROM staff_attendance WHERE user_id = ? AND work_date = ?`).bind(me.id, today).first();
  const year = Number(today.slice(0, 4));
  const lv = await leaveTaken(db, me.id, year);
  const todayLeave = lv.taken.has(today)
    ? (await db.prepare(`SELECT status FROM staff_leave_requests WHERE user_id = ? AND leave_date = ? AND status IN ('pending','approved')`).bind(me.id, today).first())?.status
    : null;

  const week = (mon) => weekdaysBetween(mon, addDays(mon, 4)).map((d) => ({ date: d, user_id: dutyOf(d), name: nameOf[dutyOf(d)] || null, holiday: holidayNames[d] || null }));
  const myDuty = weekdaysBetween(today, horizon).filter((d) => dutyOf(d) === me.id);

  const { results: received } = await db.prepare(
    `SELECT * FROM staff_duty_swaps WHERE to_user = ? AND status = 'pending' AND duty_date >= ? ORDER BY duty_date`
  ).bind(me.id, today).all();
  const { results: sent } = await db.prepare(
    `SELECT * FROM staff_duty_swaps WHERE from_user = ? ORDER BY id DESC LIMIT 20`
  ).bind(me.id).all();
  const swapRow = (s) => ({ ...s, from_name: nameOf[s.from_user] || '?', to_name: nameOf[s.to_user] || '?' });

  const grant = await db.prepare(`SELECT days, basis FROM staff_leave_grants WHERE user_id = ? AND year = ?`).bind(me.id, year).first();
  const { results: myLeaves } = await db.prepare(
    `SELECT id, leave_date, reason, status, review_note FROM staff_leave_requests
      WHERE user_id = ? AND substr(leave_date,1,4) = ? ORDER BY leave_date DESC LIMIT 60`
  ).bind(me.id, String(year)).all();

  const monthFrom = today.slice(0, 8) + '01';
  const { results: monthAtt } = await db.prepare(
    `SELECT work_date, check_in_at FROM staff_attendance WHERE user_id = ? AND work_date BETWEEN ? AND ?`
  ).bind(me.id, monthFrom, today).all();
  const monthDuty = await dutyCtx(db, monthFrom, today);
  /* 당번이 연차인 날은 전원 당번 시각 — 당번들의 승인 연차만 본다 */
  const monthLv = await leaveMap(db, monthFrom, today, ['approved']);
  const cellOpts = (d, ctx) => ({ workday: isWorkday(d, ctx.holidays), dutyAbsent: dutyAbsentOn(ctx.dutyOf(d), d, monthLv) });
  let lateCount = 0;
  for (const a of monthAtt || []) {
    const st = startFor(me.id, monthDuty.dutyOf(a.work_date), settings, cellOpts(a.work_date, monthDuty));
    if (isLate(a.check_in_at, st, settings.grace_minutes)) lateCount++;
  }

  return json({
    ok: true,
    today, now: kst(),
    me: { id: me.id, name: me.name },
    settings,
    today_cell: dayCell(me.id, today, att, dutyOf(today), todayLeave, settings, cellOpts(today, { dutyOf, holidays })),
    weekday: isWorkday(today, holidays),
    holiday: holidayNames[today] || null,
    holidays: calHol.names,
    duty: { this_week: week(thisMon), next_week: week(addDays(thisMon, 7)), mine: myDuty },
    swaps: { received: (received || []).map(swapRow), sent: (sent || []).map(swapRow) },
    colleagues: staff.filter((s) => s.id !== me.id).map((s) => ({ id: s.id, name: s.name })),
    leave: {
      year,
      days: grant ? Number(grant.days) : null,
      approved: lv.approved, pending: lv.pending,
      remaining: grant ? Number(grant.days) - lv.approved : null,
      requests: myLeaves || [],
    },
    month: { checked: (monthAtt || []).length, late: lateCount },
  });
}

async function viewToday(db, auth, today) {
  const settings = await loadSettings(db);
  const staff = await loadStaff(db);
  const { dutyOf, holidays, holidayNames } = await dutyCtx(db, today, today);
  const { results } = await db.prepare(`SELECT * FROM staff_attendance WHERE work_date = ?`).bind(today).all();
  const attBy = Object.fromEntries((results || []).map((a) => [a.user_id, a]));
  const lv = await leaveMap(db, today, today, ['approved', 'pending']);
  const duty = dutyOf(today);
  const opts = { workday: isWorkday(today, holidays), dutyAbsent: dutyAbsentOn(duty, today, lv) };
  return json({
    ok: true, today, weekday: opts.workday, holiday: holidayNames[today] || null, settings, owner: !!auth.owner,
    duty_user: duty, duty_name: (staff.find((s) => s.id === duty) || {}).name || null,
    duty_absent: opts.dutyAbsent, no_duty: noDutyDay(duty, opts),
    rows: staff.map((s) => ({ id: s.id, name: s.name, ...dayCell(s.id, today, attBy[s.id], duty, lv[s.id + '|' + today], settings, opts) })),
  });
}

function monthDays(month) {
  const out = [];
  for (let d = month + '-01'; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d);
  return out;
}

async function monthData(db, month, today) {
  const settings = await loadSettings(db);
  const staff = await loadStaff(db);
  const days = monthDays(month);
  const from = days[0], to = days[days.length - 1];
  const { dutyOf, holidays, holidayNames } = await dutyCtx(db, from, to);
  const { results } = await db.prepare(`SELECT * FROM staff_attendance WHERE work_date BETWEEN ? AND ?`).bind(from, to).all();
  const att = {};
  for (const a of results || []) att[a.user_id + '|' + a.work_date] = a;
  const lv = await leaveMap(db, from, to, ['approved', 'pending']);
  const rows = staff.map((s) => {
    const cells = {};
    const sum = { checked: 0, late: 0, leave: 0, duty: 0 };
    for (const d of days) {
      /* 주말·공휴일은 출근 기록이 있을 때만 칸을 만든다 */
      if (!isWorkday(d, holidays) && !att[s.id + '|' + d]) continue;
      const du = dutyOf(d);
      const c = dayCell(s.id, d, att[s.id + '|' + d], du, lv[s.id + '|' + d], settings, { workday: isWorkday(d, holidays), dutyAbsent: dutyAbsentOn(du, d, lv) });
      cells[d] = c;
      if (c.check_in) sum.checked++;
      if (c.late) sum.late++;
      if (c.leave === 'approved') sum.leave++;
      if (c.duty) sum.duty++;
    }
    return { id: s.id, name: s.name, cells, sum };
  });
  return { settings, days, rows, today, holidays: holidayNames };
}

async function viewMonth(db, auth, url, today) {
  const month = url.searchParams.get('month') || today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return bad('month 형식은 YYYY-MM');
  const data = await monthData(db, month, today);
  if (url.searchParams.get('format') === 'csv') {
    const header = ['날짜', '요일', '직원', '당번', '기준시각', '출근시각', '지각', '연차', '메모'];
    const WD = ['일', '월', '화', '수', '목', '금', '토'];
    const lines = [];
    for (const d of data.days) {
      for (const r of data.rows) {
        const c = r.cells[d];
        if (!c) continue;
        lines.push([d, WD[new Date(d + 'T00:00:00Z').getUTCDay()], r.name, c.duty ? '당번' : '',
          c.start, c.check_in || '', c.late ? '지각' : '',
          c.leave === 'approved' ? '연차' : (c.leave === 'pending' ? '연차(대기)' : ''), c.note || '']);
      }
    }
    return new Response(buildCsv(header, lines), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance_${month}.csv"`,
      },
    });
  }
  return json({ ok: true, month, owner: !!auth.owner, ...data });
}

async function viewDuty(db, auth, url, today) {
  let from = url.searchParams.get('from') || today;
  if (!validYmd(from)) return bad('from 형식은 YYYY-MM-DD');
  from = mondayOf(from);
  const weeks = Math.min(Math.max(Number(url.searchParams.get('weeks')) || 8, 1), 26);
  const to = addDays(from, weeks * 7 - 1);
  const staff = await loadStaff(db);
  const nameOf = Object.fromEntries(staff.map((s) => [s.id, s.name]));
  const { rotations, overrideMeta, dutyOf, holidayNames } = await dutyCtx(db, from, to);
  const lv = await leaveMap(db, from, to, ['approved']);
  const grid = [];
  for (let w = 0; w < weeks; w++) {
    const mon = addDays(from, w * 7);
    grid.push({
      monday: mon,
      days: weekdaysBetween(mon, addDays(mon, 4)).map((d) => {
        const u = dutyOf(d);
        const o = overrideMeta[d];
        return { date: d, user_id: u, name: nameOf[u] || null, override: o ? o.source : null, on_leave: !!lv[u + '|' + d], holiday: holidayNames[d] || null };
      }),
    });
  }
  const { results: swaps } = await db.prepare(`SELECT * FROM staff_duty_swaps ORDER BY id DESC LIMIT 40`).all();
  const current = rotations.filter((r) => r.effective_from <= mondayOf(today)).pop() || null;
  const upcoming = rotations.filter((r) => r.effective_from > mondayOf(today));
  return json({
    ok: true, owner: !!auth.owner, from, weeks, today, staff: staff.map((s) => ({ id: s.id, name: s.name })),
    /* 사장님 2026-10-02 "당번표에서 교체 요청 이런 거 있음 좋을 듯" — 화면이 내 당번 칸을 알아보려면 내 id 가 필요하다 */
    me_id: auth.userId ? Number(auth.userId) : null,
    rotation: current ? { ...current, names: current.members.map((id) => nameOf[id] || ('#' + id)) } : null,
    upcoming: upcoming.map((r) => ({ ...r, names: r.members.map((id) => nameOf[id] || ('#' + id)) })),
    grid,
    swaps: (swaps || []).map((s) => ({ ...s, from_name: nameOf[s.from_user] || '?', to_name: nameOf[s.to_user] || '?' })),
  });
}

async function viewLeave(db, auth, url, today) {
  const year = Number(url.searchParams.get('year')) || Number(today.slice(0, 4));
  const settings = await loadSettings(db);
  /* 근태 대상에서 뺀 사람도 입사일·대상 토글은 사장님이 봐야 하므로 is_admin 전체 */
  const { results: people } = await db.prepare(
    `SELECT u.id, COALESCE(u.real_name, u.name, 'ID#' || u.id) AS name, p.hire_date, COALESCE(p.tracked, 1) AS tracked
       FROM users u LEFT JOIN staff_profiles p ON p.user_id = u.id
      WHERE u.is_admin = 1 ORDER BY u.id ASC LIMIT 50`
  ).all();
  const { results: grants } = await db.prepare(`SELECT * FROM staff_leave_grants WHERE year = ?`).bind(year).all();
  const gBy = Object.fromEntries((grants || []).map((g) => [g.user_id, g]));
  const { results: reqs } = await db.prepare(
    `SELECT * FROM staff_leave_requests WHERE substr(leave_date,1,4) = ? ORDER BY leave_date`
  ).bind(String(year)).all();
  const rows = (people || []).map((p) => {
    const mine = (reqs || []).filter((r) => r.user_id === p.id);
    const approved = mine.filter((r) => r.status === 'approved').length;
    const g = gBy[p.id];
    const sug = p.hire_date ? suggestLeave(p.hire_date, year) : null;
    return {
      id: p.id, name: p.name, hire_date: p.hire_date || null, tracked: Number(p.tracked) !== 0,
      suggested: sug ? sug.days : null, basis: sug ? sug.basis : null,
      days: g ? Number(g.days) : null, confirmed_at: g ? g.confirmed_at : null,
      approved, pending: mine.filter((r) => r.status === 'pending').length,
      remaining: g ? Number(g.days) - approved : null,
      /* 사람별 내역 — 사장님: "누가 몇 개 남았고 언제 썼고 이런 걸 개별로". 취소 건은 뺀다 */
      requests: mine.filter((r) => r.status !== 'cancelled').sort((a, b) => (a.leave_date < b.leave_date ? 1 : -1)).slice(0, 60)
        .map((r) => ({ id: r.id, leave_date: r.leave_date, status: r.status, reason: r.reason || null,
          review_note: r.review_note || null, requested_at: r.requested_at || null, reviewed_at: r.reviewed_at || null })),
    };
  });
  const nameOf = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  /* 대기 신청 — 승인 화면에서 "그날 이 직원이 당번인지" 를 같이 보여준다 */
  const pending = (reqs || []).filter((r) => r.status === 'pending');
  let dutyOf = () => null;
  if (pending.length) {
    const ds = pending.map((r) => r.leave_date).sort();
    dutyOf = (await dutyCtx(db, ds[0], ds[ds.length - 1])).dutyOf;
  }
  return json({
    ok: true, year, today, owner: !!auth.owner, settings, rows,
    holidays: await holidayList(db, year),
    pending: pending.map((r) => ({
      ...r, name: nameOf[r.user_id] || '?', is_duty: dutyOf(r.leave_date) === Number(r.user_id),
      remaining: (rows.find((x) => x.id === r.user_id) || {}).remaining ?? null,
    })),
    recent: (reqs || []).filter((r) => r.status !== 'pending').slice(-80).reverse().map((r) => ({ ...r, name: nameOf[r.user_id] || '?' })),
  });
}

/* ───────────────────────── POST ───────────────────────── */

export async function onRequestPost(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return bad('DB error', 500);
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = (url.searchParams.get('action') || '').trim();
  let body = {};
  try { body = await context.request.json(); } catch (_) {}
  const today = todayKST();
  const now = kst();
  const actor = auth.userId ? 'admin#' + auth.userId : (auth.owner ? '사장님' : 'admin');
  const audit = (act, entity_type, entity_id, before, after) =>
    logAudit(db, { actor, action: act, entity_type, entity_id, before, after, request: context.request });

  try {
    /* ── 본인 액션 ── */
    if (['punch', 'swap_request', 'swap_respond', 'swap_cancel', 'leave_request', 'leave_cancel'].includes(action)) {
      /* leave_cancel 은 owner 도 쓴다 (승인된 건 취소) — 본인 확인을 건너뛴다 */
      if (action === 'leave_cancel' && auth.owner) return await leaveCancel(db, body, null, now, audit);
      const me = await selfStaff(db, auth);
      if (me.error) return bad(me.error, me.status);

      if (action === 'punch') {
        const existing = await db.prepare(`SELECT check_in_at FROM staff_attendance WHERE user_id = ? AND work_date = ?`).bind(me.id, today).first();
        /* 출근 재찍기는 덮지 않는다 — 처음 찍은 시각이 진짜 출근 */
        if (existing && existing.check_in_at) return json({ ok: true, already: true, check_in: existing.check_in_at.slice(11, 16) });
        await db.prepare(
          `INSERT INTO staff_attendance (user_id, work_date, check_in_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, work_date) DO UPDATE SET check_in_at = excluded.check_in_at, updated_at = excluded.updated_at`
        ).bind(me.id, today, now, now, now).run();
        return json({ ok: true, check_in: now.slice(11, 16) });
      }

      if (action === 'swap_request') {
        const dutyDate = String(body.duty_date || '');
        const returnDate = body.return_date ? String(body.return_date) : null;
        const toUser = Number(body.to_user);
        const span = [dutyDate, returnDate].filter(validYmd).sort();
        const staff = await loadStaff(db);
        const { dutyOf, holidays } = await dutyCtx(db, span[0] || today, span[span.length - 1] || today);
        const err = checkSwapRequest({ fromUser: me.id, toUser, dutyDate, returnDate, today, dutyOf, staffIds: staff.map((s) => s.id), holidays });
        if (err) return bad(err);
        const dup = await db.prepare(`SELECT id FROM staff_duty_swaps WHERE from_user = ? AND duty_date = ? AND status = 'pending'`).bind(me.id, dutyDate).first();
        if (dup) return bad(fmtMd(dutyDate) + ' 은 이미 교체 요청 중입니다');
        const reason = String(body.reason || '').trim().slice(0, 200) || null;
        const r = await db.prepare(
          `INSERT INTO staff_duty_swaps (from_user, to_user, duty_date, return_date, reason, status, requested_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`
        ).bind(me.id, toUser, dutyDate, returnDate, reason, now).run();
        return json({ ok: true, id: r.meta?.last_row_id || null });
      }

      if (action === 'swap_respond') {
        const swap = await db.prepare(`SELECT * FROM staff_duty_swaps WHERE id = ?`).bind(Number(body.id)).first();
        if (!swap) return bad('요청을 찾을 수 없습니다', 404);
        if (Number(swap.to_user) !== me.id) return bad('나에게 온 요청만 응답할 수 있습니다', 403);
        if (swap.status !== 'pending') return bad('이미 처리된 요청입니다 (' + swap.status + ')');
        if (!body.accept) {
          await db.prepare(`UPDATE staff_duty_swaps SET status = 'declined', responded_at = ? WHERE id = ?`).bind(now, swap.id).run();
          return json({ ok: true, status: 'declined' });
        }
        const span = [swap.duty_date, swap.return_date].filter(Boolean).sort();
        const staff = await loadStaff(db);
        const { dutyOf, holidays } = await dutyCtx(db, span[0], span[span.length - 1]);
        const lv = await leaveMap(db, span[0], span[span.length - 1], ['pending', 'approved']);
        const err = checkSwapAccept({
          swap, today, dutyOf, staffIds: staff.map((s) => s.id),
          hasLeave: (u, d) => !!lv[Number(u) + '|' + d], holidays,
        });
        if (err) return bad(err);
        /* 맞교환이면 두 날을 같이 바꾼다 — 한쪽만 들어가면 한 사람이 이틀 당번이 된다 */
        const stmts = [
          db.prepare(`INSERT INTO staff_duty_overrides (duty_date, user_id, source, swap_id, updated_at) VALUES (?, ?, 'swap', ?, ?)
                      ON CONFLICT(duty_date) DO UPDATE SET user_id = excluded.user_id, source = 'swap', swap_id = excluded.swap_id, updated_at = excluded.updated_at`)
            .bind(swap.duty_date, swap.to_user, swap.id, now),
        ];
        if (swap.return_date) {
          stmts.push(db.prepare(`INSERT INTO staff_duty_overrides (duty_date, user_id, source, swap_id, updated_at) VALUES (?, ?, 'swap', ?, ?)
                      ON CONFLICT(duty_date) DO UPDATE SET user_id = excluded.user_id, source = 'swap', swap_id = excluded.swap_id, updated_at = excluded.updated_at`)
            .bind(swap.return_date, swap.from_user, swap.id, now));
        }
        stmts.push(db.prepare(`UPDATE staff_duty_swaps SET status = 'accepted', responded_at = ? WHERE id = ? AND status = 'pending'`).bind(now, swap.id));
        await db.batch(stmts);
        audit('duty_swap_accept', 'staff_duty_swap', swap.id, null,
          { from_user: swap.from_user, to_user: swap.to_user, duty_date: swap.duty_date, return_date: swap.return_date });
        return json({ ok: true, status: 'accepted' });
      }

      if (action === 'swap_cancel') {
        const swap = await db.prepare(`SELECT * FROM staff_duty_swaps WHERE id = ?`).bind(Number(body.id)).first();
        if (!swap) return bad('요청을 찾을 수 없습니다', 404);
        if (Number(swap.from_user) !== me.id) return bad('내가 보낸 요청만 취소할 수 있습니다', 403);
        if (swap.status !== 'pending') return bad('이미 처리된 요청입니다 (' + swap.status + ')');
        await db.prepare(`UPDATE staff_duty_swaps SET status = 'cancelled', responded_at = ? WHERE id = ?`).bind(now, swap.id).run();
        return json({ ok: true });
      }

      if (action === 'leave_request') {
        const dates = Array.isArray(body.dates) ? body.dates.map(String) : [];
        const sorted = dates.filter(validYmd).sort();
        const year = (sorted[0] || today).slice(0, 4);
        const grant = await grantOf(db, me.id, year);
        const lv = await leaveTaken(db, me.id, year);
        const { dutyOf, holidays } = await dutyCtx(db, sorted[0] || today, sorted[sorted.length - 1] || today);
        const chk = checkLeaveRequest({
          userId: me.id, dates, today, dutyOf, grant, used: lv.approved + lv.pending, taken: lv.taken, holidays,
        });
        if (chk.error) return json({ error: chk.error, duty_date: chk.duty_date || null }, 400);
        const reason = String(body.reason || '').trim().slice(0, 200) || null;
        await db.batch(chk.dates.map((d) => db.prepare(
          `INSERT INTO staff_leave_requests (user_id, leave_date, reason, status, requested_at) VALUES (?, ?, ?, 'pending', ?)`
        ).bind(me.id, d, reason, now)));
        return json({ ok: true, count: chk.dates.length });
      }

      if (action === 'leave_cancel') return await leaveCancel(db, body, me.id, now, audit);
    }

    /* ── 사장님 전용 ── */
    if (!auth.owner) return ownerOnly();

    if (action === 'leave_review') {
      const note = String(body.note || '').trim().slice(0, 200) || null;
      const r = await reviewLeave(db, Number(body.id), !!body.approve, note, auth, now, audit);
      if (r.error) return bad(r.error, r.status);
      return json({ ok: true, status: r.result });
    }
    /* 묶음 승인·반려 — 사장님 2026-10-02 "깔쌈하게": 한 번에 신청한 여러 날을 카드 한 장에서 한 번에 */
    if (action === 'leave_review_many') {
      const ids = Array.isArray(body.ids) ? Array.from(new Set(body.ids.map(Number).filter(Boolean))).slice(0, 62) : [];
      if (!ids.length) return bad('ids 가 비었습니다');
      const note = String(body.note || '').trim().slice(0, 200) || null;
      const failed = [];
      let done = 0;
      for (const id of ids) {
        const r = await reviewLeave(db, id, !!body.approve, note, auth, now, audit);
        if (r.error) failed.push({ id, error: r.error }); else done++;
      }
      return json({ ok: true, done, failed });
    }

    if (action === 'leave_grant') {
      const userId = Number(body.user_id), year = Number(body.year), days = Number(body.days);
      if (!userId || !Number.isInteger(year) || year < 2000 || year > 2100) return bad('user_id / year 확인');
      if (!Number.isFinite(days) || days < 0 || days > 40 || Math.round(days * 10) !== days * 10) return bad('일수는 0~40 (소수 첫째 자리까지)');
      const p = await db.prepare(`SELECT hire_date FROM staff_profiles WHERE user_id = ?`).bind(userId).first();
      const sug = p && p.hire_date ? suggestLeave(p.hire_date, year) : null;
      const before = await db.prepare(`SELECT days FROM staff_leave_grants WHERE user_id = ? AND year = ?`).bind(userId, year).first();
      await db.prepare(
        `INSERT INTO staff_leave_grants (user_id, year, auto_days, days, basis, confirmed_by, confirmed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, year) DO UPDATE SET auto_days = excluded.auto_days, days = excluded.days, basis = excluded.basis,
           confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at, updated_at = excluded.updated_at`
      ).bind(userId, year, sug ? sug.days : null, days, sug ? sug.basis : null, auth.userId || null, now, now).run();
      audit('leave_grant', 'user', userId, before ? { year, days: before.days } : null, { year, days, suggested: sug ? sug.days : null });
      return json({ ok: true });
    }

    if (action === 'profile') {
      const userId = Number(body.user_id);
      const u = await db.prepare(`SELECT is_admin FROM users WHERE id = ?`).bind(userId).first();
      if (!u || Number(u.is_admin) !== 1) return bad('👑 관리자(직원)만 설정할 수 있습니다');
      const before = await db.prepare(`SELECT hire_date, tracked FROM staff_profiles WHERE user_id = ?`).bind(userId).first();
      let hire = before ? before.hire_date : null;
      let tracked = before ? Number(before.tracked) : 1;
      if ('hire_date' in body) {
        if (body.hire_date && !validYmd(body.hire_date)) return bad('입사일 형식은 YYYY-MM-DD');
        hire = body.hire_date || null;
      }
      if ('tracked' in body) tracked = body.tracked ? 1 : 0;
      await db.prepare(
        `INSERT INTO staff_profiles (user_id, hire_date, tracked, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET hire_date = excluded.hire_date, tracked = excluded.tracked, updated_at = excluded.updated_at`
      ).bind(userId, hire, tracked, now).run();
      audit('staff_profile', 'user', userId, before || null, { hire_date: hire, tracked });
      return json({ ok: true });
    }

    if (action === 'rotation') {
      const members = Array.isArray(body.members) ? body.members.map(Number).filter(Boolean) : [];
      const from = String(body.effective_from || '');
      if (!members.length) return bad('당번 순서에 직원을 넣어주세요');
      if (new Set(members).size !== members.length) return bad('같은 사람이 두 번 들어갔습니다');
      if (!validYmd(from) || mondayOf(from) !== from) return bad('적용 시작일은 월요일이어야 합니다');
      const staffIds = (await loadStaff(db)).map((s) => s.id);
      const outsider = members.find((m) => !staffIds.includes(m));
      if (outsider) return bad('근태 대상 직원이 아닌 사람이 있습니다 (#' + outsider + ')');
      await db.prepare(`INSERT INTO staff_duty_rotation (effective_from, members, created_by, created_at) VALUES (?, ?, ?, ?)`)
        .bind(from, JSON.stringify(members), auth.userId || null, now).run();
      audit('duty_rotation', 'staff_duty_rotation', null, null, { effective_from: from, members });
      return json({ ok: true });
    }

    if (action === 'duty_set') {
      const d = String(body.duty_date || '');
      if (!validYmd(d) || !isWeekday(d)) return bad('평일 날짜를 골라주세요');
      const hol = await loadHolidays(db, d, d);
      if (hol.names[d]) return bad(fmtMd(d) + ' 은 공휴일(' + hol.names[d] + ')입니다 — 당번이 없습니다');
      const before = await db.prepare(`SELECT user_id, source FROM staff_duty_overrides WHERE duty_date = ?`).bind(d).first();
      if (body.clear) {
        await db.prepare(`DELETE FROM staff_duty_overrides WHERE duty_date = ?`).bind(d).run();
        audit('duty_set', 'staff_duty_override', null, before ? { duty_date: d, ...before } : null, { duty_date: d, cleared: true });
        return json({ ok: true });
      }
      const userId = Number(body.user_id);
      const staffIds = (await loadStaff(db)).map((s) => s.id);
      if (!staffIds.includes(userId)) return bad('근태 대상 직원이 아닙니다');
      const leave = await db.prepare(`SELECT 1 FROM staff_leave_requests WHERE user_id = ? AND leave_date = ? AND status = 'approved'`).bind(userId, d).first();
      if (leave && !body.force) return json({ error: '그날 연차가 승인된 직원입니다. 그래도 지정할까요?', need_force: true }, 409);
      await db.prepare(
        `INSERT INTO staff_duty_overrides (duty_date, user_id, source, swap_id, updated_at) VALUES (?, ?, 'owner', NULL, ?)
         ON CONFLICT(duty_date) DO UPDATE SET user_id = excluded.user_id, source = 'owner', swap_id = NULL, updated_at = excluded.updated_at`
      ).bind(d, userId, now).run();
      audit('duty_set', 'staff_duty_override', null, before ? { duty_date: d, ...before } : null, { duty_date: d, user_id: userId });
      return json({ ok: true });
    }

    if (action === 'duty_set_week') {
      /* 사장님 2026-10-02: "한주씩 일괄지정하는거도 있음 좋겟어" — 그 주 월~금 5칸을 한 번에 */
      const mon = String(body.monday || '');
      if (!validYmd(mon) || mondayOf(mon) !== mon) return bad('월요일 날짜를 골라주세요');
      const fri = addDays(mon, 4);
      /* 공휴일은 건너뛴다 — 당번이 없는 날 */
      const days = workdaysBetween(mon, fri, (await loadHolidays(db, mon, fri)).map);
      if (!days.length) return bad('그 주는 전부 공휴일입니다');
      const { results: beforeRows } = await db.prepare(
        `SELECT duty_date, user_id, source FROM staff_duty_overrides WHERE duty_date BETWEEN ? AND ? ORDER BY duty_date`
      ).bind(mon, fri).all();
      const before = (beforeRows || []).length ? beforeRows : null;
      if (body.clear) {
        await db.prepare(`DELETE FROM staff_duty_overrides WHERE duty_date BETWEEN ? AND ?`).bind(mon, fri).run();
        audit('duty_set_week', 'staff_duty_override', null, before, { monday: mon, cleared: true });
        return json({ ok: true, days: days.length });
      }
      const userId = Number(body.user_id);
      const staffIds = (await loadStaff(db)).map((s) => s.id);
      if (!staffIds.includes(userId)) return bad('근태 대상 직원이 아닙니다');
      const { results: lv } = await db.prepare(
        `SELECT leave_date FROM staff_leave_requests WHERE user_id = ? AND leave_date BETWEEN ? AND ? AND status = 'approved' ORDER BY leave_date`
      ).bind(userId, mon, fri).all();
      const leaveDates = (lv || []).map((r) => r.leave_date);
      if (leaveDates.length && !body.force) {
        const md = leaveDates.map((x) => x.slice(5).replace('-', '/')).join(', ');
        return json({ error: md + ' 에 연차가 승인된 직원입니다. 그래도 이 주 전체를 지정할까요?', need_force: true, leave_dates: leaveDates }, 409);
      }
      await db.batch(days.map((d) => db.prepare(
        `INSERT INTO staff_duty_overrides (duty_date, user_id, source, swap_id, updated_at) VALUES (?, ?, 'owner', NULL, ?)
         ON CONFLICT(duty_date) DO UPDATE SET user_id = excluded.user_id, source = 'owner', swap_id = NULL, updated_at = excluded.updated_at`
      ).bind(d, userId, now)));
      audit('duty_set_week', 'staff_duty_override', null, before, { monday: mon, user_id: userId, days });
      return json({ ok: true, days: days.length });
    }

    if (action === 'edit') {
      const userId = Number(body.user_id);
      const d = String(body.work_date || '');
      if (!userId || !validYmd(d)) return bad('user_id / work_date 확인');
      const before = await db.prepare(`SELECT check_in_at, note FROM staff_attendance WHERE user_id = ? AND work_date = ?`).bind(userId, d).first();
      /* 보낸 칸만 바꾼다 — 시각만 고쳤는데 메모가 지워지면 안 된다 */
      let checkInAt = before ? before.check_in_at : null;
      if ('check_in' in body) {
        const ci = body.check_in == null || body.check_in === '' ? null : String(body.check_in);
        if (ci && !validHm(ci)) return bad('출근시각은 HH:MM');
        checkInAt = ci ? d + ' ' + ci + ':00' : null;
      }
      const note = 'note' in body
        ? (body.note == null ? null : (String(body.note).trim().slice(0, 200) || null))
        : (before ? before.note : null);
      if (!checkInAt && !note) {
        await db.prepare(`DELETE FROM staff_attendance WHERE user_id = ? AND work_date = ?`).bind(userId, d).run();
      } else {
        await db.prepare(
          `INSERT INTO staff_attendance (user_id, work_date, check_in_at, note, edited_by, edited_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, work_date) DO UPDATE SET check_in_at = excluded.check_in_at, note = excluded.note,
             edited_by = excluded.edited_by, edited_at = excluded.edited_at, updated_at = excluded.updated_at`
        ).bind(userId, d, checkInAt, note, auth.userId || 0, now, now, now).run();
      }
      audit('attendance_edit', 'user', userId, before ? { work_date: d, ...before } : { work_date: d }, { work_date: d, check_in_at: checkInAt, note });
      return json({ ok: true });
    }

    if (action === 'settings') {
      const ds = String(body.duty_start || ''), ns = String(body.normal_start || '');
      if (!validHm(ds) || !validHm(ns)) return bad('시각은 HH:MM');
      const before = await loadSettings(db);
      /* 유예는 2026-10-02 폐지 — 항상 0 */
      await db.prepare(`UPDATE staff_attendance_settings SET duty_start = ?, normal_start = ?, grace_minutes = 0, updated_at = ? WHERE id = 1`)
        .bind(ds, ns, now).run();
      audit('attendance_settings', 'settings', 1, before, { duty_start: ds, normal_start: ns });
      return json({ ok: true });
    }

    /* 공휴일 등록·삭제 — 사장님: "법정공휴일은 체크 안되나" (음력 명절·선거일·임시공휴일은 코드로 못 구한다) */
    if (action === 'holiday_add') {
      const ymd = String(body.ymd || '');
      const name = String(body.name || '').trim().slice(0, 30);
      const sub = HOLIDAY_SUB_RULES.includes(body.sub) ? body.sub : null;
      if (!validYmd(ymd)) return bad('날짜 형식은 YYYY-MM-DD');
      if (!name) return bad('공휴일 이름을 적어주세요');
      const fixed = holidayMap(ymd.slice(0, 4), []);
      if (fixed[ymd] && !fixed[ymd].sub) return bad(fmtMd(ymd) + ' 은 이미 법정공휴일(' + fixed[ymd].name + ')입니다');
      await db.prepare(
        `INSERT INTO staff_holidays (ymd, name, sub, source, created_at) VALUES (?, ?, ?, 'owner', ?)
         ON CONFLICT(ymd) DO UPDATE SET name = excluded.name, sub = excluded.sub, source = 'owner'`
      ).bind(ymd, name, sub, now).run();
      audit('holiday_add', 'staff_holiday', null, null, { ymd, name, sub });
      return json({ ok: true });
    }
    if (action === 'holiday_del') {
      const ymd = String(body.ymd || '');
      if (!validYmd(ymd)) return bad('날짜 형식은 YYYY-MM-DD');
      const before = await db.prepare(`SELECT name, sub, source FROM staff_holidays WHERE ymd = ?`).bind(ymd).first();
      if (!before) return bad('등록된 공휴일이 아닙니다 (법정공휴일·대체공휴일은 지울 수 없습니다)', 404);
      await db.prepare(`DELETE FROM staff_holidays WHERE ymd = ?`).bind(ymd).run();
      audit('holiday_del', 'staff_holiday', null, { ymd, ...before }, null);
      return json({ ok: true });
    }

    return bad('unknown action');
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/UNIQUE/i.test(msg)) return bad('이미 등록된 날짜가 있습니다');
    console.error('[attendance POST]', action, e);
    return bad('처리 중 오류가 발생했습니다', 500);
  }
}

/** 승인·반려 한 건. 성공 { result: 'approved'|'rejected' } / 실패 { error, status? } */
async function reviewLeave(db, id, approve, note, auth, now, audit) {
  const req = await db.prepare(`SELECT * FROM staff_leave_requests WHERE id = ?`).bind(id).first();
  if (!req) return { error: '신청을 찾을 수 없습니다 (#' + id + ')', status: 404 };
  if (req.status !== 'pending') return { error: fmtMd(req.leave_date) + ' 은 이미 처리된 신청입니다 (' + req.status + ')' };
  if (approve) {
    const year = req.leave_date.slice(0, 4);
    const grant = await grantOf(db, req.user_id, year);
    const lv = await leaveTaken(db, req.user_id, year);
    const { dutyOf } = await dutyCtx(db, req.leave_date, req.leave_date);
    const err = checkLeaveApprove({ userId: Number(req.user_id), date: req.leave_date, dutyOf, grant, approved: lv.approved });
    if (err) return { error: err };
  }
  const status = approve ? 'approved' : 'rejected';
  await db.prepare(
    `UPDATE staff_leave_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = 'pending'`
  ).bind(status, auth.userId || null, now, note, req.id).run();
  audit('leave_' + status, 'staff_leave_request', req.id, 'pending', { status, user_id: req.user_id, leave_date: req.leave_date, note });
  return { result: status };
}

/** 본인 대기 건 취소 / owner 는 대기·승인 건 모두 취소 */
async function leaveCancel(db, body, selfId, now, audit) {
  const req = await db.prepare(`SELECT * FROM staff_leave_requests WHERE id = ?`).bind(Number(body.id)).first();
  if (!req) return bad('신청을 찾을 수 없습니다', 404);
  if (selfId != null) {
    if (Number(req.user_id) !== selfId) return bad('내 신청만 취소할 수 있습니다', 403);
    if (req.status !== 'pending') return bad('승인된 연차 취소는 사장님께 요청해주세요');
  } else if (!['pending', 'approved'].includes(req.status)) {
    return bad('이미 처리된 신청입니다 (' + req.status + ')');
  }
  /* 누가 취소했는지 화면에서 구분 — 사장님 취소는 메모에 남기고, 본인 취소는 메모 없음 */
  if (selfId == null) {
    await db.prepare(`UPDATE staff_leave_requests SET status = 'cancelled', reviewed_at = ?, review_note = COALESCE(review_note, '사장님 취소') WHERE id = ?`)
      .bind(now, req.id).run();
    audit('leave_cancel', 'staff_leave_request', req.id, req.status, 'cancelled');
  } else {
    await db.prepare(`UPDATE staff_leave_requests SET status = 'cancelled', reviewed_at = ? WHERE id = ?`).bind(now, req.id).run();
  }
  return json({ ok: true });
}
