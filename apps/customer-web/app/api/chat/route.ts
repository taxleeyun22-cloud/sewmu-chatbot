/**
 * Phase Next-Day17 (2026-05-09): /api/chat — 인증 + RAG + daily limit 본격.
 *
 * CLAUDE.md 룰: "비회원: 사용 불가 (로그인 필수)".
 * - 비로그인 → 401
 * - pending: 일 5건 / approved_client: 무제한
 * - FAQ RAG retrieval (text-embedding-3-small + cosine top-3)
 * - conversations 저장 (검증 파이프라인 진입)
 * - 신뢰도 자동 태깅
 *
 * Cloudflare Pages env: OPENAI_API_KEY + DB binding (D1).
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { drizzle } from '@sewmu/db/client';
import * as schema from '@sewmu/db';
import { eq, and, sql } from 'drizzle-orm';
import {
  chatCompletion,
  extractConfidence,
  buildSystemPrompt,
  embedQuery,
  rankFaqsByEmbedding,
  formatRagContext,
} from '@sewmu/ai';

export const runtime = 'edge';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LIMITS: Record<string, number> = {
  pending: 5,
  approved_guest: 5,
  approved_client: 999999,
  rejected: 0,
  terminated: 0,
};

async function retrieveFaqs(db: any, apiKey: string, query: string, k = 3) {
  const { faqs } = schema;
  let queryVec: number[];
  try {
    queryVec = await embedQuery(apiKey, query);
  } catch {
    return [];
  }

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = body.message;
    const sessionIdInput = body.sessionId as string | undefined;
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message 필요' }, { status: 400 });
    }

    /* 1. 인증 (CLAUDE.md 룰: 비회원 사용 불가) */
    const session = await auth();
    const userId = session?.user?.id ? Number((session.user as { id: string }).id) : null;
    if (!userId) {
      return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    }

    /* 2. env (Cloudflare Pages bindings) */
    const env = (globalThis as any).env || (process as any)?.env || {};
    const apiKey = env.OPENAI_API_KEY;
    const d1 = env.DB;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY 미설정 (Cloudflare 환경변수 필요)' },
        { status: 500 },
      );
    }

    let ragContext = '';
    let userName: string | undefined;
    let approvalStatus = 'pending';
    let limit = 5;
    let usedToday = 0;
    const sessionId = sessionIdInput || crypto.randomUUID();

    /* 3. D1 binding 있으면 — 사용자 status / daily limit / RAG 모두 진행 */
    if (d1) {
      const db = drizzle(d1);
      const { users, dailyUsage } = schema;

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
        return NextResponse.json({ error: '사용자 없음' }, { status: 401 });
      }

      userName = user.real_name || user.name || undefined;
      approvalStatus = user.approval_status || 'pending';
      limit = LIMITS[approvalStatus] ?? 5;

      if (limit === 0) {
        return NextResponse.json(
          { error: `이용 제한 (${approvalStatus})` },
          { status: 403 },
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      const usage = await db
        .select()
        .from(dailyUsage)
        .where(and(eq(dailyUsage.user_id, userId), eq(dailyUsage.date, today)))
        .limit(1);

      usedToday = usage[0]?.count ?? 0;
      if (usedToday >= limit) {
        return NextResponse.json(
          { error: `일 한도 초과 (${usedToday}/${limit})`, limit, used: usedToday },
          { status: 429 },
        );
      }

      /* RAG */
      try {
        const top = await retrieveFaqs(db, apiKey, message, 3);
        ragContext = formatRagContext(top);
      } catch {
        /* graceful */
      }
    }

    /* 4. OpenAI 호출 */
    const systemPrompt =
      buildSystemPrompt({ userName, approvalStatus, dailyLimit: limit }) + ragContext;

    const result = await chatCompletion({
      apiKey,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });

    const { cleaned, confidence } = extractConfidence(result.content);

    /* 5. D1 있으면 conversations 저장 + daily_usage UPSERT */
    if (d1) {
      const db = drizzle(d1);
      const { conversations, dailyUsage } = schema;
      const now = new Date().toISOString();

      const existing = await db
        .select()
        .from(dailyUsage)
        .where(
          and(
            eq(dailyUsage.user_id, userId),
            eq(dailyUsage.date, new Date().toISOString().slice(0, 10)),
          ),
        )
        .limit(1);

      if (existing[0]) {
        await db
          .update(dailyUsage)
          .set({ count: usedToday + 1 })
          .where(eq(dailyUsage.id, existing[0].id));
      } else {
        await db.insert(dailyUsage).values({
          user_id: userId,
          date: new Date().toISOString().slice(0, 10),
          count: 1,
        });
      }

      await db.insert(conversations).values([
        {
          session_id: sessionId,
          user_id: userId,
          role: 'user',
          content: message,
          created_at: now,
        },
        {
          session_id: sessionId,
          user_id: userId,
          role: 'assistant',
          content: result.content,
          confidence,
          reviewed: 0,
          reported: confidence === '낮음' ? 1 : 0,
          created_at: now,
        },
      ]);
    }

    return NextResponse.json({
      response: result.content,
      cleaned,
      confidence,
      sessionId,
      usedToday: usedToday + 1,
      limit,
      tokensUsed: result.tokensUsed,
      model: result.model,
    });
  } catch (err) {
    console.error('[chat] error:', err);
    return NextResponse.json(
      { error: '챗봇 응답 실패', message: (err as Error).message },
      { status: 500 },
    );
  }
}
