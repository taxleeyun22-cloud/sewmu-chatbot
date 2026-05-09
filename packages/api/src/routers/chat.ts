/**
 * Phase Next-Week2 Day 4 (2026-05-09): chat router (tRPC).
 *
 * 기존 functions/api/chat.js 마이그레이션 (1242줄).
 * Day 4: 핵심 로직 — OpenAI 호출 + 신뢰도 자동 태깅 + daily 한도.
 * Day 5: FAQ RAG retrieval + flagged-items 추가.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { customerProcedure, router } from '../trpc';
import { chatCompletion, extractConfidence, buildSystemPrompt } from '@sewmu/ai';

export const chatRouter = router({
  /**
   * 메시지 전송 → AI 답변.
   *
   * 사용자 한도 (CLAUDE.md 룰):
   *   - pending: 일 5건
   *   - approved_client: 무제한
   *   - rejected: 0건
   */
  send: customerProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        sessionId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. 사용자 status 확인
      // Week 2 Day 5: Drizzle query 로 users 테이블 조회
      // const user = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.auth.userId!) });

      // 2. 일 한도 체크 (placeholder)
      // const today = new Date().toISOString().slice(0, 10);
      // const usage = await ctx.db.query.dailyUsage.findFirst({
      //   where: and(eq(dailyUsage.user_id, ctx.auth.userId!), eq(dailyUsage.date, today)),
      // });

      // 3. OpenAI 호출
      if (!ctx.openaiApiKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'OPENAI_API_KEY 미설정',
        });
      }

      const systemPrompt = buildSystemPrompt({
        // userName, approvalStatus, dailyLimit — Day 5 채움
      });

      const result = await chatCompletion({
        apiKey: ctx.openaiApiKey,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input.message },
        ],
      });

      // 4. 신뢰도 자동 태깅 추출
      const { cleaned, confidence } = extractConfidence(result.content);

      // 5. 응답
      return {
        response: result.content,
        cleaned,
        confidence,
        tokensUsed: result.tokensUsed,
        model: result.model,
      };
    }),
});
