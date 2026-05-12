/**
 * Phase Next-Day15 (2026-05-09): FAQ router (RAG 본체).
 * 기존 functions/api/admin-faq.js 마이그레이션.
 *
 * CRUD + 자동 재임베딩 (update 시 OpenAI text-embedding-3-small).
 */
import { z } from 'zod';
import { eq, and, or, like, desc, asc, sql, isNull } from 'drizzle-orm';
import { ownerProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';
import { logger, logCtx } from '../logger';

const VerifiedSchema = z.enum(['unchecked', 'verified', 'wrong', 'suspicious']);

/** OpenAI 임베딩 호출 (text-embedding-3-small, 1536 dim). */
async function embedText(apiKey: string, text: string): Promise<number[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  });
  if (!r.ok) {
    throw new Error(`OpenAI embedding error: ${r.status}`);
  }
  const data = (await r.json()) as { data: { embedding: number[] }[] };
  return data.data[0]?.embedding ?? [];
}

export const faqRouter = router({
  /** 전체 list (q_number ASC). 검색·카테고리·verified 필터 지원. */
  list: ownerProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        verified: VerifiedSchema.or(z.literal('all')).optional(),
        limit: z.number().int().min(1).max(500).default(500),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { faqs } = schema;

      const conditions = [];
      if (input.search) {
        const pat = `%${input.search}%`;
        conditions.push(
          or(like(faqs.question, pat), like(faqs.answer, pat), like(faqs.law_refs, pat))!,
        );
      }
      if (input.category && input.category !== 'all') {
        conditions.push(eq(faqs.category, input.category));
      }
      if (input.verified && input.verified !== 'all') {
        if (input.verified === 'unchecked') {
          conditions.push(or(isNull(faqs.verified_status), eq(faqs.verified_status, 'unchecked'))!);
        } else {
          conditions.push(eq(faqs.verified_status, input.verified));
        }
      }

      const q = conditions.length
        ? db.select().from(faqs).where(and(...conditions))
        : db.select().from(faqs);

      const rows = await q.orderBy(asc(faqs.q_number), asc(faqs.id)).limit(input.limit);

      const list = rows.map((r) => ({
        ...r,
        embedding: undefined,                                  // 임베딩은 list 응답에서 제외 (size)
        has_embedding: !!r.embedding,
      }));

      /* 카테고리별 카운트 */
      const cats = await db
        .select({
          category: faqs.category,
          n: sql<number>`COUNT(*)`,
        })
        .from(faqs)
        .where(eq(faqs.active, 1))
        .groupBy(faqs.category)
        .orderBy(desc(sql`COUNT(*)`));

      return { faqs: list, categories: cats };
    }),

  /** 단일 조회. */
  byId: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { faqs } = schema;
      const f = await db.select().from(faqs).where(eq(faqs.id, input.id)).limit(1);
      return { faq: f[0] ?? null };
    }),

  /** 생성 — 자동 임베딩. */
  create: ownerProcedure
    .input(
      z.object({
        q_number: z.number().int().optional(),
        category: z.string().optional(),
        question: z.string().min(1),
        answer: z.string().min(1),
        law_refs: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { faqs } = schema;
      const now = new Date().toISOString();

      let embeddingJson: string | null = null;
      if (ctx.openaiApiKey) {
        try {
          const vec = await embedText(ctx.openaiApiKey, `${input.question}\n${input.answer}`);
          embeddingJson = JSON.stringify(vec);
        } catch (err) {
          /* 임베딩 실패해도 FAQ 자체는 저장 (수동 재시도 가능) — Logpush 로는 발송 */
          logger.warn(
            'FAQ embedding failed on create — manual re-embed needed',
            logCtx(ctx, 'faq.create', { q_number: input.q_number ?? null }),
            err,
          );
        }
      }

      const r = await db
        .insert(faqs)
        .values({
          q_number: input.q_number ?? null,
          category: input.category ?? null,
          question: input.question,
          answer: input.answer,
          law_refs: input.law_refs ?? null,
          embedding: embeddingJson,
          active: 1,
          verified_status: 'unchecked',
          created_at: now,
          updated_at: now,
        })
        .returning({ id: faqs.id });

      return { ok: true, id: r[0]?.id ?? 0 };
    }),

  /** 수정 — question/answer 바뀌면 자동 재임베딩. */
  update: ownerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        question: z.string().optional(),
        answer: z.string().optional(),
        law_refs: z.string().optional(),
        category: z.string().optional(),
        active: z.union([z.literal(0), z.literal(1)]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { faqs } = schema;
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      const needsReembedding = input.question !== undefined || input.answer !== undefined;
      let nextQ = '';
      let nextA = '';
      if (needsReembedding) {
        const cur = await db.select().from(faqs).where(eq(faqs.id, input.id)).limit(1);
        if (cur[0]) {
          nextQ = input.question ?? cur[0].question;
          nextA = input.answer ?? cur[0].answer;
        }
      }

      if (input.question !== undefined) updates.question = input.question;
      if (input.answer !== undefined) updates.answer = input.answer;
      if (input.law_refs !== undefined) updates.law_refs = input.law_refs;
      if (input.category !== undefined) updates.category = input.category;
      if (input.active !== undefined) updates.active = input.active;

      if (needsReembedding && ctx.openaiApiKey && nextQ && nextA) {
        try {
          const vec = await embedText(ctx.openaiApiKey, `${nextQ}\n${nextA}`);
          updates.embedding = JSON.stringify(vec);
        } catch (err) {
          /* 임베딩 실패해도 텍스트는 저장 — Logpush 로는 발송 */
          logger.warn(
            'FAQ embedding failed on update — manual re-embed needed',
            logCtx(ctx, 'faq.update', { id: input.id }),
            err,
          );
        }
      }

      await db.update(faqs).set(updates).where(eq(faqs.id, input.id));
      return { ok: true };
    }),

  /** verified 상태 마킹 (Claude 재검증 후 verified). */
  setVerified: ownerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: VerifiedSchema,
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { faqs } = schema;
      await db
        .update(faqs)
        .set({
          verified_status: input.status,
          verified_note: input.note ?? null,
          verified_at: new Date().toISOString(),
        })
        .where(eq(faqs.id, input.id));
      return { ok: true };
    }),

  /** 삭제 (active=0). */
  remove: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { faqs } = schema;
      await db.update(faqs).set({ active: 0 }).where(eq(faqs.id, input.id));
      return { ok: true };
    }),
});
