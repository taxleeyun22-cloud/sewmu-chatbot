/**
 * Phase Next-Day15 (2026-05-09): filings schema (신고 검토표).
 * 기존 functions/api/admin-filings.js + tax-filings.js D1 스키마 마이그레이션.
 *
 * 사장님 명세 (2026-05-07): 종소세·법인세 신고 결재 검토표.
 * - 작년 vs 올해 자동 비교
 * - 누적 메모 통합 (memos.attached_to_type + attached_to_id)
 * - PDF export
 * - 결재 흐름: 작성중 → 결재대기 → 보관완료
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const filings = sqliteTable('filings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),                          // '종소세' | '법인세' | '부가세' (확장 가능)
  fiscal_year: integer('fiscal_year').notNull(),         // 귀속연도 (2025 등)
  owner_type: text('owner_type').notNull(),              // 'Person' | 'Business'
  owner_id: integer('owner_id').notNull(),               // users.id 또는 businesses.id
  included_business_ids: text('included_business_ids'),  // JSON array (Person Case 시 합산할 사업장 N개)
  auto_fields: text('auto_fields'),                      // JSON (자동 채움 필드 + 사장님 수동 입력)
  review_status: text('review_status').default('작성중'),
  reviewer_comment: text('reviewer_comment'),
  author_user_id: integer('author_user_id'),
  reviewer_user_id: integer('reviewer_user_id'),
  reviewed_at: text('reviewed_at'),
  deleted_at: text('deleted_at'),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
});

/** tax_filings = 부가세/원천세/법인세 체크리스트 (filings 와 별도, 간단 todo 형식) */
export const taxFilings = sqliteTable('tax_filings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  business_id: integer('business_id'),
  user_id: integer('user_id'),
  filing_type: text('filing_type'),                      // '부가세_1기' / '종소세' / etc
  period_year: integer('period_year'),
  period_label: text('period_label'),
  due_date: text('due_date'),
  status: text('status').default('pending'),             // 'pending' | 'submitted' | 'overdue'
  amount_estimated: integer('amount_estimated'),
  amount_actual: integer('amount_actual'),
  submitted_at: text('submitted_at'),
  notes: text('notes'),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
});

export type Filing = typeof filings.$inferSelect;
export type FilingInsert = typeof filings.$inferInsert;
export type TaxFiling = typeof taxFilings.$inferSelect;
