/**
 * Phase Next-1.2 (2026-05-09): memos schema (Drizzle).
 *
 * 메모 빡센 세팅 (2026-04-29) 이후 컬럼 누적:
 *   - target_user_id / target_business_id / room_id (3가지 scope)
 *   - category (전화/문서/이슈/약속/일반/할 일/거래처 정보/완료)
 *   - tags (JSON array, e.g., ["부가세", "1기예정"])
 *   - attachments (JSON array of R2 keys)
 *   - due_date / assigned_to_user_id
 *   - reactions (JSON, 미사용)
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const memos = sqliteTable('memos', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Target (3가지 scope)
  target_user_id: integer('target_user_id'),         // 거래처(사람) 메모
  target_business_id: integer('target_business_id'), // 업체 메모
  room_id: text('room_id'),                          // 상담방 담당자 메모

  // Content
  memo_type: text('memo_type'),                      // 'todo' | 'info' | 'completed' (legacy)
  category: text('category'),                        // '전화' | '문서' | '이슈' | '약속' | '일반' (Phase 5)
  content: text('content').notNull(),
  tags: text('tags'),                                // JSON array: ["부가세", "1기예정"]
  attachments: text('attachments'),                  // JSON array: [{key, name, size, mime}]

  // Schedule
  due_date: text('due_date'),                        // YYYY-MM-DD
  assigned_to_user_id: integer('assigned_to_user_id'),  // '내 일정' 용

  // Author / audit
  author_id: integer('author_id'),
  author_name: text('author_name'),
  is_checked: integer('is_checked').default(0),
  checked_at: text('checked_at'),
  checked_by: text('checked_by'),

  // Soft delete (휴지통)
  deleted_at: text('deleted_at'),

  // Timestamps
  created_at: text('created_at'),
  updated_at: text('updated_at'),
});

export type Memo = typeof memos.$inferSelect;
export type NewMemo = typeof memos.$inferInsert;
