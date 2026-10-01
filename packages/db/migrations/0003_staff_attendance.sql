-- 2026-10-01: 직원 근태 · 당번 · 연차.
--
-- 사용:
--   npx wrangler d1 execute DB --remote --file=packages/db/migrations/0003_staff_attendance.sql
--
-- functions/api/attendance.js 의 ensureTables() 와 같은 DDL 이다. 이 파일을 돌리기 전에도
-- 첫 호출에 테이블이 생기므로 기능은 바로 동작하고, 나중에 돌려도 IF NOT EXISTS 라 안전하다.
--
-- 직원 = users.is_admin = 1 (사용자 탭 👑 관리자). users 테이블은 건드리지 않는다.
-- 당번·지각·연차 잔여는 저장하지 않고 조회 시 계산한다 (functions/api/_attendance-core.js).

-- 직원 프로필: 입사일 + 근태 대상 여부
CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id INTEGER PRIMARY KEY,
  hire_date TEXT,
  tracked INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);

-- 출근: 한 사람·하루 1행 (퇴근은 기록하지 않는다 — 사장님 "출근만 찍자")
CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  check_in_at TEXT,
  note TEXT,
  edited_by INTEGER,
  edited_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_att_user_date ON staff_attendance(user_id, work_date);

-- 당번 순서 — 버전으로 쌓는다 (순서를 바꿔도 지난 주 당번이 안 바뀌게)
CREATE TABLE IF NOT EXISTS staff_duty_rotation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_from TEXT NOT NULL,
  members TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

-- 하루 단위 당번 덮어쓰기 (사장님 지정 · 교체 수락)
CREATE TABLE IF NOT EXISTS staff_duty_overrides (
  duty_date TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  swap_id INTEGER,
  updated_at TEXT NOT NULL
);

-- 직원끼리 당번 교체 요청
CREATE TABLE IF NOT EXISTS staff_duty_swaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user INTEGER NOT NULL,
  to_user INTEGER NOT NULL,
  duty_date TEXT NOT NULL,
  return_date TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL,
  responded_at TEXT
);

-- 연차 부여 (회계연도별, 사장님 확정값)
CREATE TABLE IF NOT EXISTS staff_leave_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  auto_days REAL,
  days REAL NOT NULL,
  basis TEXT,
  confirmed_by INTEGER,
  confirmed_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_user_year ON staff_leave_grants(user_id, year);

-- 연차 신청 (종일 1일 = 1행)
CREATE TABLE IF NOT EXISTS staff_leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  leave_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL,
  reviewed_by INTEGER,
  reviewed_at TEXT,
  review_note TEXT
);
-- 같은 날 이중 신청 차단 (반려·취소 건은 다시 신청 가능)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_user_date_active
  ON staff_leave_requests(user_id, leave_date) WHERE status IN ('pending','approved');

-- 출근 기준시각 · 유예 (사장님: "1분까진 봐준다고 하자")
CREATE TABLE IF NOT EXISTS staff_attendance_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  duty_start TEXT DEFAULT '09:00',
  normal_start TEXT DEFAULT '09:30',
  grace_minutes INTEGER DEFAULT 1,
  updated_at TEXT
);
INSERT OR IGNORE INTO staff_attendance_settings (id) VALUES (1);

INSERT OR IGNORE INTO _migrations (name, applied_at, checksum)
VALUES ('0003_staff_attendance', datetime('now'), 'attendance-v1');
