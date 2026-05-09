/**
 * Phase Next-Day26 (2026-05-09): error_logs schema (자체 에러 로거).
 *
 * CLAUDE.md "🐞 에러 로그 — 옵션 A 룰":
 * - 거래처 챗봇 / 사장님 admin 화면 JS 에러 자동 D1 저장
 * - 사이드바 빨간 무당벌레 배지 = 7일 이내 N건
 * - 사장님 명령 받을 때만 분석 (자동 분석 X)
 *
 * 기존 functions/api/admin-error-log.js 마이그레이션.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const errorLogs = sqliteTable('error_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),                     // 'admin' / 'customer' / 'business' / 'office' / etc
  user_id: integer('user_id'),                          // 로그인 사용자 (있을 때)
  message: text('message').notNull(),                   // Error.message
  stack: text('stack'),                                  // Error.stack (truncated to 4000 chars)
  url: text('url'),                                      // window.location.href
  user_agent: text('user_agent'),
  /* 추가 컨텍스트 — JSON */
  context: text('context'),
  /* 사장님이 검토 완료 처리 */
  resolved: integer('resolved').default(0),
  resolved_at: text('resolved_at'),
  resolved_by: integer('resolved_by'),
  created_at: text('created_at'),
});

export type ErrorLog = typeof errorLogs.$inferSelect;
export type ErrorLogInsert = typeof errorLogs.$inferInsert;
