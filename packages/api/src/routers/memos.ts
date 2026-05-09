/**
 * Phase Next-Week5 (2026-05-09): memos router.
 * 기존 functions/api/memos.js 마이그레이션.
 */
import { z } from 'zod';
import { adminProcedure, router } from '../trpc';
import { NewMemoSchema } from '@sewmu/types';

export const memosRouter = router({
  list: adminProcedure
    .input(
      z.object({
        scope: z
          .enum(['my', 'customer_all', 'customer_info', 'business_all', 'business_info', 'business_due', 'room_full', 'trash_count', 'trash_list'])
          .default('my'),
        user_id: z.number().int().positive().optional(),
        business_id: z.number().int().positive().optional(),
        room_id: z.string().optional(),
        category: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().default(200),
      }),
    )
    .query(async () => {
      return { memos: [] };
    }),

  create: adminProcedure
    .input(NewMemoSchema)
    .mutation(async () => {
      return { ok: true, id: 0 };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        patch: z.object({
          content: z.string().optional(),
          category: z.string().optional(),
          due_date: z.string().optional(),
          is_checked: z.union([z.literal(0), z.literal(1)]).optional(),
        }),
      }),
    )
    .mutation(async () => {
      return { ok: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async () => {
      // soft delete (휴지통)
      return { ok: true };
    }),

  restore: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async () => {
      return { ok: true };
    }),

  purge: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async () => {
      return { ok: true };
    }),
});
