/**
 * Phase Next-1.2 (2026-05-09): chat_rooms / room_members / room_businesses / room_labels schema.
 */
import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';

export const chatRooms = sqliteTable('chat_rooms', {
  id: text('id').primaryKey(),                      // 6자리 코드
  name: text('name'),
  status: text('status').default('active'),         // 'active' | 'closed'
  ai_mode: text('ai_mode').default('on'),           // 'on' | 'off'
  is_internal: integer('is_internal').default(0),   // 1 = 관리자방
  business_id: integer('business_id'),              // legacy (room_businesses 테이블로 대체)
  priority: integer('priority').default(0),         // 담당자 라벨 ID
  phone: text('phone'),                             // 방별 전담 직통번호
  created_by_user_id: integer('created_by_user_id'),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
  closed_at: text('closed_at'),
});

export const roomMembers = sqliteTable('room_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  room_id: text('room_id').notNull(),
  user_id: integer('user_id').notNull(),
  role: text('role').default('member'),             // 'admin' | 'member'
  visible_since: text('visible_since'),              // 메시지 view 시작 시점 (NULL = 전체 / 'now' / 'YYYY-MM-DD')
  joined_at: text('joined_at'),
  left_at: text('left_at'),                          // soft leave
  last_read_at: text('last_read_at'),                // 미읽음 카운트 기준
});

/** N:N 매핑 (사장님 명령 2026-05-05) */
export const roomBusinesses = sqliteTable('room_businesses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  room_id: text('room_id').notNull(),
  business_id: integer('business_id').notNull(),
  is_primary: integer('is_primary').default(0),
  linked_at: text('linked_at'),
  removed_at: text('removed_at'),
});

export const roomLabels = sqliteTable('room_labels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color'),                              // HEX
  ord: integer('ord').default(0),
  created_at: text('created_at'),
});

export const roomNotices = sqliteTable('room_notices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  room_id: text('room_id').notNull(),
  content: text('content'),
  is_pinned: integer('is_pinned').default(0),
  created_by_user_id: integer('created_by_user_id'),
  created_at: text('created_at'),
});

export type ChatRoom = typeof chatRooms.$inferSelect;
export type RoomMember = typeof roomMembers.$inferSelect;
export type RoomBusiness = typeof roomBusinesses.$inferSelect;
export type RoomLabel = typeof roomLabels.$inferSelect;
