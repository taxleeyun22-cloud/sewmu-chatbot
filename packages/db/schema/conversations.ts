/**
 * Phase Next-1.2 (2026-05-09): conversations / sessions schema.
 *
 * conversations: chat 메시지 (사용자/AI/세무사)
 * sessions: 로그인 세션 (Auth.js 가 향후 대체)
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  session_id: text('session_id'),                   // chat session UUID
  user_id: integer('user_id'),
  room_id: text('room_id'),                          // NULL = 일반 챗봇, 값 있음 = 상담방

  role: text('role').notNull(),                      // 'user' | 'assistant' | 'human_advisor'
  content: text('content'),

  // AI 답변 메타
  confidence: text('confidence'),                    // '높음' | '보통' | '낮음' (Phase 5 자동 태깅)
  reviewed: integer('reviewed').default(0),
  reported: integer('reported').default(0),
  reviewed_by: text('reviewed_by'),
  reviewed_at: text('reviewed_at'),

  // Document 첨부 (영수증)
  document_id: integer('document_id'),

  // Read tracking
  unread_count: integer('unread_count'),

  // Soft delete
  deleted_at: text('deleted_at'),

  // Timestamps
  created_at: text('created_at'),
});

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),                 // CSPRNG 32 chars
  user_id: integer('user_id').notNull(),
  expires_at: text('expires_at'),
  created_at: text('created_at'),
  last_accessed_at: text('last_accessed_at'),        // idle timeout 용 (Phase Infra-2 후속)
});

export const dailyUsage = sqliteTable('daily_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  date: text('date').notNull(),                      // YYYY-MM-DD
  count: integer('count').default(0),
});

export type Conversation = typeof conversations.$inferSelect;
export type Session = typeof sessions.$inferSelect;
