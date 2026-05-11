/**
 * Phase Next-Day27 (2026-05-11): audit_logs schema (Stripe/Notion 패턴).
 *
 * 사장님 결정 2026-05-11: 직원이 뭘 했는지 추적 + 사고 발생 시 누가 했는지 명확.
 *
 * 자동 INSERT 시점:
 * - 모든 admin mutation (사용자 승인 / 메모 / 영수증 승인 / 단체발송 / etc)
 * - owner-only 액션 (admin 권한 부여 / 업체 삭제 / 메모 일괄삭제 / etc)
 *
 * 7일 retention default (사장님이 dashboard 에서 조회 가능, 1년 무료 보관).
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  /** 누가 (필수) — 사장님/직원 user_id */
  actor_user_id: integer('actor_user_id').notNull(),
  /** actor role 캡처 — 권한 변경 시 추적 정확 */
  actor_role: text('actor_role'),                    // 'owner' | 'admin' | 'customer'

  /** 어떤 액션 — 권한 catalog 와 동일 keys */
  action: text('action').notNull(),                  // 'admin:user:set_admin' 등

  /** 대상 (선택) — user_id / business_id / memo_id / etc */
  target_type: text('target_type'),                  // 'user' | 'business' | 'memo' | 'filing' | etc
  target_id: integer('target_id'),

  /** 추가 컨텍스트 (JSON) — 이전·이후 값 등 */
  before: text('before'),                            // JSON (변경 전)
  after: text('after'),                              // JSON (변경 후)

  /** 결과 — 성공/실패 / 거부 */
  result: text('result').default('success'),         // 'success' | 'failure' | 'forbidden'
  error_message: text('error_message'),

  /** 요청 메타 */
  ip: text('ip'),
  user_agent: text('user_agent'),

  created_at: text('created_at'),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type AuditLogInsert = typeof auditLogs.$inferInsert;
