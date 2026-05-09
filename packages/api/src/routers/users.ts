/**
 * Phase Next-Day5 (2026-05-09): users router (tRPC + Drizzle 본격).
 * 기존 functions/api/admin-users.js + admin-approve.js 마이그레이션.
 */
import { z } from 'zod';
import { eq, and, isNull, like, or, sql, desc } from 'drizzle-orm';
import { adminProcedure, ownerProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

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
      const db = drizzle(ctx.db);
      const { users } = schema;
      const conditions = [
        isNull(users.deleted_at),
        sql`COALESCE(${users.approval_status}, 'pending') NOT IN ('merged', 'deleted', 'withdrawn')`,
        sql`COALESCE(${users.provider}, '') != 'merged'`,
      ];
      if (input.status === 'admin') {
        conditions.push(eq(users.is_admin, 1));
      } else if (input.status) {
        conditions.push(eq(users.approval_status, input.status));
      }
      if (input.search) {
        const pat = `%${input.search}%`;
        conditions.push(
          or(
            like(users.real_name, pat),
            like(users.name, pat),
            like(users.phone, pat),
            like(users.email, pat),
          )!,
        );
      }
      const list = await db
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(desc(users.last_login_at))
        .limit(input.limit);
      return { users: list };
    }),

  /**
   * 사용자 status 변경 (사장님 admin UI 의 "승인 / 거절 / 종료" 버튼).
   * CLAUDE.md 룰: 사장님 명시 명령 (UI 클릭) 만 OK.
   */
  setStatus: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        status: StatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { users } = schema;
      await db
        .update(users)
        .set({
          approval_status: input.status,
          approved_at: new Date().toISOString(),
        })
        .where(eq(users.id, input.userId));
      return { ok: true };
    }),

  /**
   * Admin 권한 부여 / 회수 — owner only (RBAC).
   * CLAUDE.md 룰: 자동 변경 절대 X. 사장님 명시 클릭 만.
   */
  setAdmin: ownerProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        isAdmin: z.union([z.literal(0), z.literal(1)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { users } = schema;
      await db
        .update(users)
        .set({ is_admin: input.isAdmin })
        .where(eq(users.id, input.userId));
      return { ok: true };
    }),
});
