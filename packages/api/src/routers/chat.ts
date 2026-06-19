/**
 * Phase Next-Day16 (2026-05-09): chat router 본격 (OpenAI + RAG + daily_usage gate).
 *
 * 기존 functions/api/chat.js 마이그레이션 (1242줄).
 * - 사용자 status 검증 (CLAUDE.md 룰: pending=5/일, approved_client=무제한, rejected=0)
 * - daily_usage UPSERT
 * - FAQ RAG retrieval (cosine similarity, top-3)
 * - 신뢰도 자동 태깅
 * - conversations 테이블 자동 저장 (검증 파이프라인 진입)
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql } from 'drizzle-orm';
import { customerProcedure, router } from '../trpc';
import {
  chatCompletion,
  extractConfidence,
  buildSystemPrompt,
  embedQuery,
  rankFaqsByEmbedding,
  formatRagContext,
} from '@sewmu/ai';
import { drizzle, schema } from '@sewmu/db/client';
import { logger, logCtx } from '../logger';

type DrizzleDb = ReturnType<typeof drizzle>;

/** Top-K FAQ 검색 (RAG) — @sewmu/ai 의 순수 함수 위에서 D1 fetch 만 wrapping. */
async function retrieveFaqs(db: DrizzleDb, apiKey: string, query: string, k = 3) {
  const { faqs } = schema;
  const queryVec = await embedQuery(apiKey, query);

  const rows = await db
    .select({
      question: faqs.question,
      answer: faqs.answer,
      law_refs: faqs.law_refs,
      embedding: faqs.embedding,
    })
    .from(faqs)
    .where(and(eq(faqs.active, 1), sql`${faqs.embedding} IS NOT NULL`));

  return rankFaqsByEmbedding(rows, queryVec, { k });
}

const LIMITS: Record<string, number> = {
  pending: 5,
  approved_guest: 5, // deprecated
  approved_client: 999999,
  rejected: 0,
  terminated: 0,
};

export const chatRouter = router({
  /** 메시지 전송 → AI 답변. */
  send: customerProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        sessionId: z.string().optional(),
        roomId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      if (!ctx.openaiApiKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'OPENAI_API_KEY 미설정',
        });
      }

      const db = drizzle(ctx.db);
      const { users, dailyUsage, conversations, roomMembers } = schema;

      /* 1. 사용자 status 확인 + daily 한도 체크 */
      const userRow = await db
        .select({
          id: users.id,
          name: users.name,
          real_name: users.real_name,
          approval_status: users.approval_status,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userRow[0];
      if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: '사용자 없음' });
      }

      /* 보안 (C2, 2026-06-18): roomId 가 오면 그 방의 활성 멤버인지 검증.
       * 미검증 시 임의/내부(is_internal) 방에 메시지 주입 = 크로스테넌트 IDOR.
       * OpenAI 호출 전에 fail-fast. roomId 없으면 일반 챗(room_id=null) — 통과. */
      if (input.roomId) {
        const member = await db
          .select({ id: roomMembers.id })
          .from(roomMembers)
          .where(
            and(
              eq(roomMembers.room_id, input.roomId),
              eq(roomMembers.user_id, userId),
              sql`${roomMembers.left_at} IS NULL`,
            ),
          )
          .limit(1);
        if (!member[0]) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '해당 상담방 접근 권한이 없습니다.' });
        }
      }

      const status = user.approval_status || 'pending';
      const limit = LIMITS[status] ?? 5;

      if (limit === 0) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `이용 제한 (${status})`,
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      const usage = await db
        .select()
        .from(dailyUsage)
        .where(and(eq(dailyUsage.user_id, userId), eq(dailyUsage.date, today)))
        .limit(1);

      const usedToday = usage[0]?.count ?? 0;
      if (usedToday >= limit) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `일 한도 초과 (${usedToday}/${limit})`,
        });
      }

      /* 2. RAG retrieval (top-3 FAQ) */
      let ragContext = '';
      try {
        const top = await retrieveFaqs(db, ctx.openaiApiKey, input.message, 3);
        ragContext = formatRagContext(top);
      } catch (err) {
        /* RAG 실패해도 chat 자체는 진행 (graceful degrade). Sentry/Logpush 로는 보냄. */
        logger.warn(
          'RAG retrieval failed — graceful degrade',
          logCtx(ctx, 'chat.send', { messageLen: input.message.length }),
          err,
        );
      }

      /* 3. OpenAI 호출 */
      const systemPrompt =
        buildSystemPrompt({
          userName: user.real_name || user.name || undefined,
          approvalStatus: status,
          dailyLimit: limit,
        }) + ragContext;

      const result = await chatCompletion({
        apiKey: ctx.openaiApiKey,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input.message },
        ],
      });

      const { cleaned, confidence } = extractConfidence(result.content);

      /* 4. daily_usage UPSERT */
      const now = new Date().toISOString();
      if (usage[0]) {
        await db
          .update(dailyUsage)
          .set({ count: usedToday + 1 })
          .where(eq(dailyUsage.id, usage[0].id));
      } else {
        await db.insert(dailyUsage).values({
          user_id: userId,
          date: today,
          count: 1,
        });
      }

      /* 5. conversations 저장 (user + assistant 2건) */
      const sessionId = input.sessionId || crypto.randomUUID();
      await db.insert(conversations).values([
        {
          session_id: sessionId,
          user_id: userId,
          room_id: input.roomId ?? null,
          role: 'user',
          content: input.message,
          created_at: now,
        },
        {
          session_id: sessionId,
          user_id: userId,
          room_id: input.roomId ?? null,
          role: 'assistant',
          content: result.content,
          confidence,
          /* 신뢰도 보통/낮음이면 자동 검증 큐 진입 (reviewed=0 default) */
          reviewed: 0,
          reported: confidence === '낮음' ? 1 : 0,
          created_at: now,
        },
      ]);

      return {
        response: result.content,
        cleaned,
        confidence,
        sessionId,
        usedToday: usedToday + 1,
        limit,
        tokensUsed: result.tokensUsed,
        model: result.model,
      };
    }),

  /** 사용자 일별 사용량 (UI 배지). */
  todayUsage: customerProcedure.query(async ({ ctx }) => {
    if (!ctx.auth.userId) return { count: 0, limit: 5 };
    const db = drizzle(ctx.db);
    const { users, dailyUsage } = schema;

    const today = new Date().toISOString().slice(0, 10);
    const [u, used] = await Promise.all([
      db
        .select({ approval_status: users.approval_status })
        .from(users)
        .where(eq(users.id, ctx.auth.userId))
        .limit(1),
      db
        .select()
        .from(dailyUsage)
        .where(and(eq(dailyUsage.user_id, ctx.auth.userId), eq(dailyUsage.date, today)))
        .limit(1),
    ]);

    const status = u[0]?.approval_status || 'pending';
    const limit = LIMITS[status] ?? 5;
    return { count: used[0]?.count ?? 0, limit, status };
  }),

  /** 최근 대화 (session 단위). UI 사이드바 또는 마이페이지. */
  recentSessions: customerProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.auth.userId) return { sessions: [] };
      const db = drizzle(ctx.db);
      const { conversations } = schema;

      const rows = await db
        .select({
          session_id: conversations.session_id,
          first_msg: sql<string>`MIN(${conversations.created_at})`,
          last_msg: sql<string>`MAX(${conversations.created_at})`,
          msg_count: sql<number>`COUNT(*)`,
        })
        .from(conversations)
        .where(eq(conversations.user_id, ctx.auth.userId))
        .groupBy(conversations.session_id)
        .orderBy(desc(sql`MAX(${conversations.created_at})`))
        .limit(input.limit);

      return { sessions: rows };
    }),
});
