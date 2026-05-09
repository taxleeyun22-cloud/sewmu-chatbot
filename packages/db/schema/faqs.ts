/**
 * Phase Next-Day15 (2026-05-09): FAQ schema (RAG 본체).
 * 기존 functions/api/admin-faq.js + _faq.js + _rag.js D1 테이블 마이그레이션.
 *
 * Q1~Q71 + 향후 추가. 임베딩은 OpenAI text-embedding-3-small (1536 dim).
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const faqs = sqliteTable('faqs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  q_number: integer('q_number'),                         // Q1, Q2, ... (사용자 번호)
  category: text('category'),                             // '부가세' / '종소세' / '법인세' / etc
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  law_refs: text('law_refs'),                             // 법령 근거 (JSON 또는 plain)
  embedding: text('embedding'),                           // JSON array of 1536 floats
  active: integer('active').default(1),
  verified_status: text('verified_status'),               // 'unchecked' | 'verified' | 'wrong' | 'suspicious'
  verified_note: text('verified_note'),
  verified_at: text('verified_at'),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
});

export type Faq = typeof faqs.$inferSelect;
export type FaqInsert = typeof faqs.$inferInsert;
