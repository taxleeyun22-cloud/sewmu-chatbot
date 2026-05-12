/**
 * Phase Next-Day26 (2026-05-09): error_logs router (자체 에러 로거).
 *
 * CLAUDE.md "🐞 에러 로그 — 옵션 A 룰":
 * - log: 거래처/사장님 누구나 호출 (publicProcedure)
 * - list / count / resolve: ownerProcedure (사장님 만)
 * - clear: ownerProcedure (전체 비우기)
 * - 7일 무당벌레 배지 카운트
 *
 * 보안:
 * - source 화이트리스트 (verify/test/__test__ 등 차단 — 가짜 빨간 점 방지)
 * - message/stack 길이 제한 (DoS guard)
 */
import { z } from 'zod';
import { eq, and, isNull, desc, sql, gte, or } from 'drizzle-orm';
import { router, publicProcedure, ownerProcedure } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';
import { logger, logCtx } from '../logger';

const ALLOWED_SOURCES = new Set([
  'admin',
  'customer',
  'business',
  'office',
  'memo-window',
  'mypage',
  'chat',
]);

export const errorLogsRouter = router({
  /** 클라이언트에서 JS 에러 발생 시 호출. 사용자/거래처 모두 사용. */
  log: publicProcedure
    .input(
      z.object({
        source: z.string().min(1).max(32),
        message: z.string().min(1).max(2000),
        stack: z.string().max(4000).optional(),
        url: z.string().max(500).optional(),
        user_agent: z.string().max(500).optional(),
        context: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      /* CLAUDE.md 룰: prod 검증 시 가짜 source 차단 */
      if (!ALLOWED_SOURCES.has(input.source)) {
        return { ok: false, error: 'invalid source' };
      }

      const db = drizzle(ctx.db);
      const { errorLogs } = schema;

      try {
        await db.insert(errorLogs).values({
          source: input.source,
          user_id: ctx.auth.userId ?? null,
          message: input.message,
          stack: input.stack ?? null,
          url: input.url ?? null,
          user_agent: input.user_agent ?? null,
          context: input.context ? JSON.stringify(input.context) : null,
          resolved: 0,
          created_at: new Date().toISOString(),
        });
        return { ok: true };
      } catch (e) {
        /* 로그 저장 자체 실패해도 앱 동작에 영향 X — meta-logger 로는 발송 */
        logger.error(
          'error_logs.log self-insert failed',
          logCtx(ctx, 'errorLogs.log', { source: input.source }),
          e,
        );
        /* 보안: public procedure 에서 raw e.message 노출 금지 (packages/auth/CLAUDE.md).
         * 사장님은 Logpush / D1 audit_logs 로 원본 확인 — 클라이언트는 중립 메시지. */
        return { ok: false, error: 'log_insert_failed' };
      }
    }),

  /** 사이드바 빨간 무당벌레 배지 — 7일 이내 미해결 카운트. */
  recentCount: ownerProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { errorLogs } = schema;

    const r = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(errorLogs)
      .where(
        and(
          eq(errorLogs.resolved, 0),
          sql`date(${errorLogs.created_at}) >= date('now', '-7 days')`,
        ),
      );

    return { count: r[0]?.c ?? 0 };
  }),

  /** 사장님 검토용 list (사이드바 무당벌레 클릭). */
  list: ownerProcedure
    .input(
      z.object({
        resolved: z.boolean().optional(),
        source: z.string().optional(),
        days: z.number().int().min(1).max(90).default(7),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { errorLogs } = schema;

      const conditions = [
        sql`date(${errorLogs.created_at}) >= date('now', '-' || ${input.days} || ' days')`,
      ];
      if (input.resolved !== undefined) {
        conditions.push(eq(errorLogs.resolved, input.resolved ? 1 : 0));
      }
      if (input.source) {
        conditions.push(eq(errorLogs.source, input.source));
      }

      const list = await db
        .select()
        .from(errorLogs)
        .where(and(...conditions))
        .orderBy(desc(errorLogs.created_at))
        .limit(input.limit);

      return { errors: list };
    }),

  /** 사장님이 'resolved' 마킹 — 무당벌레 카운트 ↓. */
  resolve: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { errorLogs } = schema;

      await db
        .update(errorLogs)
        .set({
          resolved: 1,
          resolved_at: new Date().toISOString(),
          resolved_by: ctx.auth.userId,
        })
        .where(eq(errorLogs.id, input.id));
      return { ok: true };
    }),

  /** 7일 지난 항목 일괄 정리. */
  clearOld: ownerProcedure
    .input(z.object({ days: z.number().int().min(7).max(365).default(7) }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { errorLogs } = schema;

      const before = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(errorLogs)
        .where(sql`date(${errorLogs.created_at}) < date('now', '-' || ${input.days} || ' days')`);

      await db
        .delete(errorLogs)
        .where(sql`date(${errorLogs.created_at}) < date('now', '-' || ${input.days} || ' days')`);

      return { ok: true, deleted: before[0]?.c ?? 0 };
    }),

  /** 전체 비우기 — 사장님 명시 명령 only. */
  clearAll: ownerProcedure.mutation(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { errorLogs } = schema;
    await db.delete(errorLogs);
    return { ok: true };
  }),
});
