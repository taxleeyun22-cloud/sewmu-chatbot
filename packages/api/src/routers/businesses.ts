/**
 * Phase Next-Week4 (2026-05-09): businesses router.
 * 기존 functions/api/admin-businesses.js 마이그레이션.
 */
import { z } from 'zod';
import { adminProcedure, ownerProcedure, router } from '../trpc';

export const businessesRouter = router({
  list: adminProcedure
    .input(
      z.object({
        status: z.enum(['all', 'active', 'closed', 'terminated']).default('all'),
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      }),
    )
    .query(async () => {
      return { businesses: [], counts: {} };
    }),

  get: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async () => {
      return { business: null, members: [], rooms: [], branches: [], parent: null };
    }),

  create: adminProcedure
    .input(
      z.object({
        company_name: z.string().min(1),
        business_number: z.string().optional(),
        ceo_name: z.string().optional(),
        company_form: z.string().optional(),
        parent_business_id: z.number().int().positive().optional(),  // 본·지점 매핑
      }),
    )
    .mutation(async () => {
      return { ok: true, id: 0 };
    }),

  delete: ownerProcedure  // owner only — 영구 삭제
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async () => {
      return { ok: true };
    }),
});
