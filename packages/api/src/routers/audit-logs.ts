/**
 * Phase Next-Day27 (2026-05-11): audit_logs router.
 *
 * 사장님 매일 모니터링 — 누가·언제·뭘 변경했는지 추적.
 * GitHub / Stripe / Notion 의 audit log 패턴.
 *
 * owner-only (직원은 본인 활동 조회만 가능 — 별도 endpoint).
 */
import { z } from 'zod';
import { eq, and, desc, sql, like } from 'drizzle-orm';
import { router, ownerProcedure } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

export const auditLogsRouter = router({
  /** owner 전용 — 전체 audit log 조회. */
  list: ownerProcedure
    .input(
      z.object({
        actor_user_id: z.number().int().positive().optional(),
        action: z.string().optional(),                  // prefix LIKE — 'admin:user:%' 등
        target_type: z.string().optional(),
        target_id: z.number().int().positive().optional(),
        days: z.number().int().min(1).max(365).default(7),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { auditLogs } = schema;

      const conditions = [
        sql`date(${auditLogs.created_at}) >= date('now', '-' || ${input.days} || ' days')`,
      ];
      if (input.actor_user_id) {
        conditions.push(eq(auditLogs.actor_user_id, input.actor_user_id));
      }
      if (input.action) {
        conditions.push(like(auditLogs.action, `${input.action}%`));
      }
      if (input.target_type) {
        conditions.push(eq(auditLogs.target_type, input.target_type));
      }
      if (input.target_id) {
        conditions.push(eq(auditLogs.target_id, input.target_id));
      }

      const logs = await db
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.created_at))
        .limit(input.limit);

      return { logs };
    }),

  /** 액션 별 집계 (사장님 dashboard — '직원별 활동량'). */
  byActor: ownerProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(7) }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { auditLogs, users } = schema;

      const rows = await db
        .select({
          actor_user_id: auditLogs.actor_user_id,
          actor_name: users.real_name,
          action_count: sql<number>`COUNT(*)`,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actor_user_id, users.id))
        .where(sql`date(${auditLogs.created_at}) >= date('now', '-' || ${input.days} || ' days')`)
        .groupBy(auditLogs.actor_user_id)
        .orderBy(desc(sql`COUNT(*)`));

      return { actors: rows };
    }),

  /** 특정 대상의 변경 history (예: user_id=5 의 모든 권한 변경). */
  byTarget: ownerProcedure
    .input(
      z.object({
        target_type: z.string(),
        target_id: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { auditLogs } = schema;

      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.target_type, input.target_type),
            eq(auditLogs.target_id, input.target_id),
          ),
        )
        .orderBy(desc(auditLogs.created_at))
        .limit(input.limit);

      return { logs };
    }),
});
