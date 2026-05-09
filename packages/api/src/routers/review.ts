/**
 * Phase Next-Day15 (2026-05-09): review router (AI 답변 검증).
 * 기존 functions/api/admin-review.js + admin-sync-to-github.js 마이그레이션.
 *
 * CLAUDE.md "🚨 자동 검증 시스템" 룰 — flagged-items.json 동기화 → Claude 재검증 사이클.
 */
import { z } from 'zod';
import { eq, and, or, isNull, sql, desc } from 'drizzle-orm';
import { ownerProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

const FilterSchema = z.enum(['pending', 'low', 'medium', 'reported', 'all']);
const ConfidenceSchema = z.enum(['높음', '보통', '낮음']);

export const reviewRouter = router({
  /**
   * 검증 대기 답변 list (보통/낮음/신고된 answer).
   * 각 answer 와 짝지어진 question (직전 user 메시지) 를 같이 반환.
   */
  list: ownerProcedure
    .input(
      z.object({
        filter: FilterSchema.default('pending'),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { conversations, users } = schema;

      const conditions = [eq(conversations.role, 'assistant')];

      if (input.filter === 'pending') {
        conditions.push(
          or(
            sql`${conversations.confidence} IN ('보통','낮음')`,
            eq(conversations.reported, 1),
          )!,
        );
        conditions.push(
          or(
            eq(conversations.reviewed, 0),
            isNull(conversations.reviewed),
          )!,
        );
      } else if (input.filter === 'low') {
        conditions.push(eq(conversations.confidence, '낮음'));
        conditions.push(or(eq(conversations.reviewed, 0), isNull(conversations.reviewed))!);
      } else if (input.filter === 'medium') {
        conditions.push(eq(conversations.confidence, '보통'));
        conditions.push(or(eq(conversations.reviewed, 0), isNull(conversations.reviewed))!);
      } else if (input.filter === 'reported') {
        conditions.push(eq(conversations.reported, 1));
        conditions.push(or(eq(conversations.reviewed, 0), isNull(conversations.reviewed))!);
      }

      /* JOIN users + 직전 user 질문 (subquery 로 fetch) */
      const list = await db
        .select({
          id: conversations.id,
          session_id: conversations.session_id,
          user_id: conversations.user_id,
          created_at: conversations.created_at,
          content: conversations.content,
          confidence: conversations.confidence,
          reviewed: conversations.reviewed,
          reported: conversations.reported,
          user_name: users.name,
          user_real_name: users.real_name,
          provider: users.provider,
        })
        .from(conversations)
        .leftJoin(users, eq(conversations.user_id, users.id))
        .where(and(...conditions))
        .orderBy(desc(conversations.created_at))
        .limit(input.limit);

      /* 각 answer 의 직전 user 질문 fetch (Drizzle subquery 대신 N+1 — 50건만이라 OK) */
      const enriched = await Promise.all(
        list.map(async (row) => {
          const q = await db
            .select({ content: conversations.content })
            .from(conversations)
            .where(
              and(
                eq(conversations.session_id, row.session_id ?? ''),
                eq(conversations.role, 'user'),
                sql`${conversations.created_at} < ${row.created_at}`,
              ),
            )
            .orderBy(desc(conversations.created_at))
            .limit(1);

          return {
            ...row,
            question: q[0]?.content ?? null,
          };
        }),
      );

      return { items: enriched };
    }),

  /** 검토 완료 처리. */
  markReviewed: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { conversations } = schema;
      await db
        .update(conversations)
        .set({
          reviewed: 1,
          reviewed_at: new Date().toISOString(),
          reviewed_by: ctx.auth.userId ? String(ctx.auth.userId) : null,
        })
        .where(eq(conversations.id, input.id));
      return { ok: true };
    }),

  /** 신고 (reported=1, reviewed=0 — Claude FAQ 재검증 큐 진입). */
  report: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { conversations } = schema;
      await db
        .update(conversations)
        .set({ reported: 1, reviewed: 0 })
        .where(eq(conversations.id, input.id));
      return { ok: true };
    }),

  /** 신고 해제. */
  unreport: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { conversations } = schema;
      await db
        .update(conversations)
        .set({ reported: 0 })
        .where(eq(conversations.id, input.id));
      return { ok: true };
    }),

  /** 신뢰도 수동 변경 (강등/승급). 강등 시 reviewed=0 + reported=1 (재검증 투입). */
  setConfidence: ownerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        confidence: ConfidenceSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { conversations } = schema;
      const downgrade = input.confidence === '보통' || input.confidence === '낮음';
      await db
        .update(conversations)
        .set(
          downgrade
            ? { confidence: input.confidence, reviewed: 0, reported: 1 }
            : { confidence: input.confidence },
        )
        .where(eq(conversations.id, input.id));
      return { ok: true };
    }),

  /** 카운트 (검증 대기 N건). 사이드바 배지용. */
  pendingCount: ownerProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { conversations } = schema;
    const r = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(
        and(
          eq(conversations.role, 'assistant'),
          or(
            sql`${conversations.confidence} IN ('보통','낮음')`,
            eq(conversations.reported, 1),
          )!,
          or(eq(conversations.reviewed, 0), isNull(conversations.reviewed))!,
        ),
      );
    return { count: r[0]?.c ?? 0 };
  }),
});
