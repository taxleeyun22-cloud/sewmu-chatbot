/**
 * Phase Next-Week4 (2026-05-09): users router (tRPC).
 * 기존 functions/api/admin-users.js + admin-approve.js 마이그레이션.
 */
import { z } from 'zod';
import { adminProcedure, ownerProcedure, router } from '../trpc';

const StatusSchema = z.enum([
  'pending',
  'approved_client',
  'approved_guest',
  'rejected',
  'terminated',
  'rejoined',
  'admin',
]);

export const usersRouter = router({
  list: adminProcedure
    .input(
      z.object({
        status: StatusSchema.optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Day 5: Drizzle query
      // const list = await ctx.db.query.users.findMany({
      //   where: and(
      //     eq(users.approval_status, input.status),
      //     isNull(users.deleted_at),
      //   ),
      //   limit: input.limit,
      // });
      return { users: [], counts: {} };
    }),

  setStatus: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        status: StatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // CLAUDE.md 룰: 사용자 권한 자동 변경 금지 — 사장님 명시 명령만
      // 이 endpoint 는 사장님이 admin UI 에서 직접 클릭 시 호출
      return { ok: true };
    }),

  setAdmin: ownerProcedure  // owner only (CLAUDE.md 룰)
    .input(
      z.object({
        userId: z.number().int().positive(),
        isAdmin: z.union([z.literal(0), z.literal(1)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // owner 권한 필수 (RBAC)
      return { ok: true };
    }),
});
