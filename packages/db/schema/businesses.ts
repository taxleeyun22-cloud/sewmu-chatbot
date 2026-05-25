/**
 * Phase Next-1.2 (2026-05-09): businesses 테이블 schema (Drizzle).
 *
 * 위하고 호환 14필드 + 본·지점 매핑 + 메모/문서 N:N
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const businesses = sqliteTable('businesses', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // 위하고 호환 14필드
  company_name: text('company_name').notNull(),
  business_number: text('business_number'),         // 사업자등록번호 (10자리)
  sub_business_number: text('sub_business_number'), // 종사업자번호
  corporate_number: text('corporate_number'),       // 법인등록번호
  ceo_name: text('ceo_name'),
  company_form: text('company_form'),               // '0.법인사업자' | '1.개인사업자' | '2.간이사업자' | '3.기타'
  business_category: text('business_category'),     // 업태
  industry: text('industry'),                        // 업종
  industry_code: text('industry_code'),              // 업종코드
  tax_type: text('tax_type'),                        // 과세유형 (일반/간이)
  address: text('address'),
  phone: text('phone'),
  establishment_date: text('establishment_date'),   // 개업일 YYYY-MM-DD
  closed_date: text('closed_date'),                  // 폐업일자 (사장님 명령 2026-05-08)

  // 회계
  fiscal_year_start: text('fiscal_year_start'),
  fiscal_year_end: text('fiscal_year_end'),
  fiscal_term: integer('fiscal_term'),               // 기수
  contract_date: text('contract_date'),              // 수임일자
  hr_year: integer('hr_year'),                       // 인사연도

  // 본·지점 매핑 (사장님 명령 2026-05-08)
  parent_business_id: integer('parent_business_id'),  // NULL = 본점, 값 있음 = 지점
  /* 담당 직원 staff_user_id (사장님 명령 2026-05-25) 는 Drizzle schema 미포함 — raw SQL + lazy ALTER 관리.
   * (schema 에 넣으면 select-all 이 prod 미존재 컬럼 참조해 깨짐 — is_checked drift 사고 회피). */

  // Status
  status: text('status').default('active'),          // 'active' | 'closed' | 'terminated'
  notes: text('notes'),

  // 보안 (CLAUDE.md 룰 — 평문 저장 X, AES-GCM 필수)
  hometax_password_enc: text('hometax_password_enc'),  // 미사용 (Phase #10 보안 강화 예정)

  // Bulk import
  import_batch_id: integer('import_batch_id'),

  // Soft delete
  deleted_at: text('deleted_at'),

  // Timestamps
  created_at: text('created_at'),
  updated_at: text('updated_at'),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
