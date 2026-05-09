/**
 * Phase Next-Day16 (2026-05-09): documents schema (영수증·계약서·신고서).
 * 기존 functions/api/upload-doc.js + admin-documents.js 마이그레이션.
 *
 * 흐름: 거래처 R2 업로드 → OCR Vision API 자동 분석 → 사장님 승인/반려.
 */
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  business_id: integer('business_id'),                    // 어느 업체 거래처용 (Phase M20)
  room_id: text('room_id'),

  doc_type: text('doc_type').notNull(),                   // '영수증' | '계약서' | '신고서' | etc
  image_key: text('image_key').notNull(),                 // R2 key

  // OCR 결과
  ocr_status: text('ocr_status').default('pending'),      // 'pending' | 'success' | 'failed'
  ocr_model: text('ocr_model'),                           // 'gpt-4o-mini' / etc
  ocr_raw: text('ocr_raw'),                               // 원본 응답 JSON
  ocr_confidence: real('ocr_confidence'),

  // 추출 필드
  vendor: text('vendor'),                                  // 매입처
  vendor_biz_no: text('vendor_biz_no'),
  amount: integer('amount'),
  vat_amount: integer('vat_amount'),
  receipt_date: text('receipt_date'),
  category: text('category'),                              // '복리후생비' / '광고선전비' / etc
  category_src: text('category_src'),                      // 'auto' | 'manual'
  items: text('items'),                                    // JSON array

  // 승인 흐름
  status: text('status').default('pending'),               // 'pending' | 'approved' | 'rejected'
  approver_id: integer('approver_id'),
  approved_at: text('approved_at'),
  reject_reason: text('reject_reason'),
  note: text('note'),

  // Soft delete
  deleted_at: text('deleted_at'),

  // Timestamps
  created_at: text('created_at'),
});

export type Document = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
