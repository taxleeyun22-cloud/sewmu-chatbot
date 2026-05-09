/**
 * Phase Next-Day21 (2026-05-09): business_members schema (사람 ↔ 업체 N:N).
 * 기존 functions/api/admin-businesses.js 의 business_members 테이블 마이그레이션.
 *
 * 1 사람 = N 업체 가능 (예: 박승호 = 본인 개인사업자 + 본인 법인 + 처가 법인).
 * 1 업체 = N 사람 가능 (예: ABC상회 = 사장님 + 직원 1명).
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const businessMembers = sqliteTable('business_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  business_id: integer('business_id').notNull(),
  user_id: integer('user_id').notNull(),
  is_primary: integer('is_primary').default(0),     // 주 사업장 (대표)
  role: text('role'),                                 // 'owner' | 'staff' | NULL (legacy)
  created_at: text('created_at'),
  removed_at: text('removed_at'),                    // soft delete
});

export type BusinessMember = typeof businessMembers.$inferSelect;
