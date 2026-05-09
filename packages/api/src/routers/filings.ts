/**
 * Phase Next-Week5 (2026-05-09): filings router.
 * 기존 functions/api/admin-filings.js + tax-filings.js 마이그레이션.
 */
import { z } from 'zod';
import { adminProcedure, router } from '../trpc';
import { FilingType } from '@sewmu/types';

export const filingsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        owner_type: z.enum(['Person', 'Business']).optional(),
        owner_id: z.number().int().positive().optional(),
        room_id: z.string().optional(),
      }),
    )
    .query(async () => {
      return { filings: [] };
    }),

  create: adminProcedure
    .input(
      z.object({
        type: FilingType,
        fiscal_year: z.number().int(),
        owner_type: z.enum(['Person', 'Business']),
        owner_id: z.number().int().positive(),
        included_business_ids: z.array(z.number().int().positive()).optional(),
      }),
    )
    .mutation(async () => {
      return { ok: true, id: 0 };
    }),

  setStatus: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(['작성중', '결재대기', '보관완료']),
      }),
    )
    .mutation(async () => {
      return { ok: true };
    }),

  toggleItem: adminProcedure
    .input(z.object({ item_id: z.number().int().positive() }))
    .mutation(async () => {
      return { ok: true };
    }),
});
