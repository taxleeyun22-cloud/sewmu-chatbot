/**
 * Phase Next-1.7 (2026-05-09): @sewmu/types — Zod schemas (validation + types).
 *
 * 사용:
 *   import { ChatMessageSchema, type ChatMessage } from '@sewmu/types';
 *
 * Drizzle inferred types 와 별도 — API 입력 / 검증용.
 * Drizzle = DB row, Zod = API input/output.
 */
import { z } from 'zod';

/** 챗봇 메시지 (사용자 input) */
export const ChatMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  session_id: z.string().uuid().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** 메모 생성 */
export const NewMemoSchema = z.object({
  content: z.string().min(1).max(5000),
  category: z
    .enum(['전화', '문서', '이슈', '약속', '일반', '할 일', '거래처 정보', '완료'])
    .optional(),
  target_user_id: z.number().int().positive().optional(),
  target_business_id: z.number().int().positive().optional(),
  room_id: z.string().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tags: z.array(z.string()).optional(),
});
export type NewMemo = z.infer<typeof NewMemoSchema>;

/** 사용자 승인 status (CLAUDE.md 룰) */
export const ApprovalStatus = z.enum([
  'pending',
  'approved_client',
  'approved_guest',  // deprecated 2026-05-02
  'rejected',
  'terminated',
  'rejoined',
  'withdrawn',
  'deleted',
]);
export type ApprovalStatusType = z.infer<typeof ApprovalStatus>;

/** RBAC role (Phase #10) */
export const StaffRole = z.enum(['owner', 'manager', 'staff']);
export type StaffRoleType = z.infer<typeof StaffRole>;

/** 신고 type (한국 세무) */
export const FilingType = z.enum([
  '부가세',
  '종소세',
  '법인세',
  '원천세',
  '양도세',
  '지방세',
  '기타',
]);
export type FilingTypeType = z.infer<typeof FilingType>;

// Phase X (2026-05-20): 청구서 시스템 — 별도 파일에서 모든 schema/type re-export
export * from "./billing.js";
