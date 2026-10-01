/**
 * 2026-10-01: 직원 근태 · 당번 · 연차 (Drizzle).
 *
 * 정본 DDL = migrations/0003_staff_attendance.sql (functions/api/attendance.js ensureTables 와 동일).
 * 직원 = users.is_admin = 1. 당번·지각·잔여는 저장하지 않고 _attendance-core.js 가 계산한다.
 */
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

export const staffProfiles = sqliteTable('staff_profiles', {
  user_id: integer('user_id').primaryKey(),
  hire_date: text('hire_date'),                       // YYYY-MM-DD
  tracked: integer('tracked').notNull().default(1),   // 0 = 근태 명단 제외
  updated_at: text('updated_at'),
});

export const staffAttendance = sqliteTable('staff_attendance', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  work_date: text('work_date').notNull(),             // YYYY-MM-DD (KST)
  check_in_at: text('check_in_at'),                   // YYYY-MM-DD HH:MM:SS (KST)
  note: text('note'),
  edited_by: integer('edited_by'),
  edited_at: text('edited_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const staffDutyRotation = sqliteTable('staff_duty_rotation', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  effective_from: text('effective_from').notNull(),   // 월요일 YYYY-MM-DD
  members: text('members').notNull(),                 // JSON [user_id, …]
  created_by: integer('created_by'),
  created_at: text('created_at').notNull(),
});

export const staffDutyOverrides = sqliteTable('staff_duty_overrides', {
  duty_date: text('duty_date').primaryKey(),
  user_id: integer('user_id').notNull(),
  source: text('source').notNull(),                   // 'owner' | 'swap'
  swap_id: integer('swap_id'),
  updated_at: text('updated_at').notNull(),
});

export const staffDutySwaps = sqliteTable('staff_duty_swaps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  from_user: integer('from_user').notNull(),
  to_user: integer('to_user').notNull(),
  duty_date: text('duty_date').notNull(),
  return_date: text('return_date'),
  reason: text('reason'),
  status: text('status').notNull().default('pending'), // pending | accepted | declined | cancelled
  requested_at: text('requested_at').notNull(),
  responded_at: text('responded_at'),
});

export const staffLeaveGrants = sqliteTable('staff_leave_grants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  year: integer('year').notNull(),
  auto_days: real('auto_days'),
  days: real('days').notNull(),
  basis: text('basis'),
  confirmed_by: integer('confirmed_by'),
  confirmed_at: text('confirmed_at'),
  updated_at: text('updated_at'),
});

export const staffLeaveRequests = sqliteTable('staff_leave_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  leave_date: text('leave_date').notNull(),
  reason: text('reason'),
  status: text('status').notNull().default('pending'), // pending | approved | rejected | cancelled
  requested_at: text('requested_at').notNull(),
  reviewed_by: integer('reviewed_by'),
  reviewed_at: text('reviewed_at'),
  review_note: text('review_note'),
});

export const staffAttendanceSettings = sqliteTable('staff_attendance_settings', {
  id: integer('id').primaryKey(),
  duty_start: text('duty_start').default('09:00'),
  normal_start: text('normal_start').default('09:30'),
  grace_minutes: integer('grace_minutes').default(1),
  updated_at: text('updated_at'),
});
