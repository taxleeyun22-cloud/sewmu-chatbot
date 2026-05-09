/**
 * Phase Next-1.2 (2026-05-09): users 테이블 schema (Drizzle).
 *
 * 기존 D1 의 users 테이블 reverse-engineer.
 * Lazy ALTER 50곳 컬럼 누적 → 모두 schema 화.
 *
 * 사장님 컬럼 (CLAUDE.md 룰):
 *   - is_admin: 1 = 관리자, 0 = 일반
 *   - is_owner: 1 = 사장님 (user_id=1 하드코딩 폐기 예정)
 *   - staff_role: 'manager' | 'staff' | NULL (RBAC 3단계, Phase #10)
 *   - approval_status: pending / approved_client / approved_guest (deprecated 2026-05-02) / rejected / terminated / rejoined / withdrawn / deleted
 *   - provider: kakao / naver / manual / merged
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // OAuth provider
  provider: text('provider'),  // 'kakao' | 'naver' | 'manual' | 'merged'
  provider_id: text('provider_id'),

  // 식별 정보
  name: text('name'),                    // 카톡 닉네임 또는 자체 입력
  real_name: text('real_name'),          // 본명 (필수)
  email: text('email'),
  email_verified: text('email_verified'),  // Auth.js 표준 (Day 15)
  phone: text('phone'),                  // 010-1234-5678
  profile_image: text('profile_image'),  // 카톡 프사 URL

  // 승인 / 권한
  approval_status: text('approval_status').default('pending'),
  approved_at: text('approved_at'),
  is_admin: integer('is_admin').default(0),         // 0 = 일반, 1 = 관리자
  is_owner: integer('is_owner').default(0),         // 0 = 일반, 1 = 사장님 (Phase Infra-2 후속)
  staff_role: text('staff_role'),                   // 'manager' | 'staff' | NULL (Phase #10 RBAC)

  // 본인 확인
  name_confirmed: integer('name_confirmed').default(0),
  birth_date: text('birth_date'),                   // YYYY-MM-DD (RRN front 6자리 → birth)

  // 거래처 정보
  company_name: text('company_name'),               // 호환 (legacy)
  ceo_name: text('ceo_name'),                       // 호환 (legacy)
  business_number: text('business_number'),         // 호환 (legacy)

  // Bulk import
  import_batch_id: integer('import_batch_id'),

  // Merge / Soft delete
  active_merge_id: integer('active_merge_id'),
  is_likely_merged: integer('is_likely_merged').default(0),
  deleted_at: text('deleted_at'),

  // Timestamps
  created_at: text('created_at'),
  last_login_at: text('last_login_at'),
  updated_at: text('updated_at'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
