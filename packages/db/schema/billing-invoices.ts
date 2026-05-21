/**
 * Phase D1 (2026-05-21): billing_invoices + billing_template Drizzle schema.
 *
 * 사장님 명령: "구글식으로 업데이트 — 새 admin 통합".
 * 옛 functions/api/billing-invoices.js 의 D1 컬럼 그대로 마이그레이션.
 * 새 admin (apps/admin) Next.js + tRPC 통합 — packages/types/src/billing.ts 의 Zod 와 페어.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * 청구서 인스턴스 — 거래처/사업장별 발행.
 * - business_id 또는 user_id 중 하나 필수 (수기 청구서는 향후 manual_label 컬럼 추가)
 * - filing_id: 검토표 자동 prefill 연결 (있으면 검토표 → 청구서 흐름)
 * - s2_items / s3_items: JSON array (양식 활증업무 / 카탈로그 공제감면)
 * - status: 'pending'(미수) | 'sent'(발송) | 'paid'(수금)
 */
export const billingInvoices = sqliteTable('billing_invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  business_id: integer('business_id'),
  user_id: integer('user_id'),
  filing_id: integer('filing_id'),

  year: integer('year'),
  tax_type: text('tax_type'),                     // '종소세' | '법인세' | '부가세'

  revenue: integer('revenue'),                    // 수입금액 (검토표 prefill)
  asset: integer('asset'),                        // 자산총액
  biz_type: text('biz_type'),                     // 업종 (제조/도소매업/...)
  basic_type: text('basic_type'),                 // 업무구분 (법인장부대행 및 법인조정 등)

  base_fee: integer('base_fee').default(0),       // 기본 세무조정료 (누진표)
  s2_addition: integer('s2_addition').default(0), // Section 2 합계 (활증업무)
  s3_addition: integer('s3_addition').default(0), // Section 3 합계 (공제감면 가산)
  discount: integer('discount').default(0),       // 할인액 (사장님 수기 룰, 자동화 절대 X)
  total_fee: integer('total_fee').default(0),     // 최종 청구 (VAT 포함)

  s2_items: text('s2_items'),                     // JSON array: [{name, val, qty}]
  s3_items: text('s3_items'),                     // JSON array: [{code, name, amt, rule, gain}]

  staff_user_id: integer('staff_user_id'),        // 담당자 (users.id)
  staff_override: integer('staff_override').default(0),  // 거래처 default 담당자 override 여부

  status: text('status').default('pending'),      // 'pending' | 'sent' | 'paid'
  sent_at: text('sent_at'),
  paid_at: text('paid_at'),
  paid_amount: integer('paid_amount'),

  note: text('note'),
  created_by_user_id: integer('created_by_user_id'),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
  deleted_at: text('deleted_at'),                 // soft delete
});

/**
 * 청구서 양식 (Template) — 단일 row (id=1) SSoT.
 * 인삿말 / 계좌 / 사무실 정보 / 누진표 (개인·법인 별).
 * 1개 row 만 UPDATE — 모든 청구서가 이 양식 참조.
 */
export const billingTemplate = sqliteTable('billing_template', {
  id: integer('id').primaryKey(),                 // 항상 1
  greeting: text('greeting'),                     // 인삿말
  bank_info: text('bank_info'),                   // 계좌번호·예금주
  office_address: text('office_address'),
  office_phone: text('office_phone'),
  signature_text: text('signature_text'),         // 서명 ("세무사 이재윤")
  fee_rule_indv: text('fee_rule_indv'),           // JSON {tariff: [[임계, 기본보수, 가산률], ...]}
  fee_rule_corp: text('fee_rule_corp'),           // JSON
  updated_at: text('updated_at'),
});

/** Drizzle inferred types — Zod (packages/types/src/billing.ts) 와 별도 */
export type BillingInvoice = typeof billingInvoices.$inferSelect;
export type NewBillingInvoice = typeof billingInvoices.$inferInsert;
export type BillingTemplateRow = typeof billingTemplate.$inferSelect;
