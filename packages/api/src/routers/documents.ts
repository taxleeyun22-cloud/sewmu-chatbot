/**
 * Phase Next-Week5 (2026-05-09): documents router.
 * 기존 functions/api/admin-documents.js + upload-doc.js 마이그레이션.
 *
 * 영수증 / 계약서 / 신고서 등 문서 관리 + R2 storage.
 */
import { z } from 'zod';
import { adminProcedure, customerProcedure, router } from '../trpc';

export const documentsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'all']).default('all'),
        user_id: z.number().int().positive().optional(),
        business_id: z.number().int().positive().optional(),
        limit: z.number().default(100),
      }),
    )
    .query(async () => {
      return { documents: [] };
    }),

  approve: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        vendor: z.string().optional(),
        amount: z.number().optional(),
        receipt_date: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .mutation(async () => {
      return { ok: true, alerts_created: 0 };
    }),

  reject: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async () => {
      return { ok: true };
    }),

  upload: customerProcedure
    .input(
      z.object({
        // R2 upload 는 multipart 별도 endpoint
        key: z.string(),
        name: z.string(),
        size: z.number(),
        mime: z.string(),
        business_id: z.number().int().positive().optional(),
      }),
    )
    .mutation(async () => {
      return { ok: true, document_id: 0 };
    }),
});
