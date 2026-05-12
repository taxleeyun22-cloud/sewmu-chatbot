/**
 * Phase Next-Day5 (2026-05-09): memos router (Drizzle 본격).
 * 기존 functions/api/memos.js 마이그레이션.
 */
import { z } from 'zod';
import { eq, and, isNull, isNotNull, like, desc, or } from 'drizzle-orm';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';
import { NewMemoSchema } from '@sewmu/types';

export const memosRouter = router({
  list: adminProcedure
    .input(
      z.object({
        scope: z
          .enum(['my', 'customer_all', 'customer_info', 'business_all', 'business_info', 'business_due', 'room_full', 'trash_count', 'trash_list'])
          .default('my'),
        user_id: z.number().int().positive().optional(),
        business_id: z.number().int().positive().optional(),
        room_id: z.string().optional(),
        category: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { memos } = schema;
      const conditions = [];
      if (input.scope === 'my' && ctx.auth.userId) {
        conditions.push(eq(memos.assigned_to_user_id, ctx.auth.userId));
        conditions.push(or(isNull(memos.deleted_at), eq(memos.deleted_at, ''))!);
      } else if (input.scope === 'customer_all' && input.user_id) {
        conditions.push(eq(memos.target_user_id, input.user_id));
        conditions.push(or(isNull(memos.deleted_at), eq(memos.deleted_at, ''))!);
      } else if (input.scope === 'business_all' && input.business_id) {
        conditions.push(eq(memos.target_business_id, input.business_id));
        conditions.push(or(isNull(memos.deleted_at), eq(memos.deleted_at, ''))!);
      } else if (input.scope === 'room_full' && input.room_id) {
        conditions.push(eq(memos.room_id, input.room_id));
        conditions.push(or(isNull(memos.deleted_at), eq(memos.deleted_at, ''))!);
      } else if (input.scope === 'trash_count' || input.scope === 'trash_list') {
        conditions.push(isNotNull(memos.deleted_at));
      } else {
        return { memos: [], count: 0 };
      }
      if (input.category) conditions.push(eq(memos.category, input.category));
      if (input.tag) conditions.push(like(memos.tags, `%"${input.tag}"%`));
      const list = await db
        .select()
        .from(memos)
        .where(and(...conditions))
        .orderBy(desc(memos.created_at))
        .limit(input.limit);
      return { memos: list, count: list.length };
    }),

  create: adminProcedure
    .input(NewMemoSchema)
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { memos } = schema;
      const now = new Date().toISOString();
      const result = await db
        .insert(memos)
        .values({
          target_user_id: input.target_user_id || null,
          target_business_id: input.target_business_id || null,
          room_id: input.room_id || null,
          content: input.content,
          category: input.category || null,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          due_date: input.due_date || null,
          author_id: ctx.auth.userId || null,
          created_at: now,
          updated_at: now,
        })
        .returning({ id: memos.id });
      return { ok: true, id: result[0]?.id || 0 };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        patch: z.object({
          content: z.string().optional(),
          category: z.string().optional(),
          due_date: z.string().optional(),
          is_checked: z.union([z.literal(0), z.literal(1)]).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { memos } = schema;
      await db
        .update(memos)
        .set({ ...input.patch, updated_at: new Date().toISOString() })
        .where(eq(memos.id, input.id));
      return { ok: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { memos } = schema;
      await db
        .update(memos)
        .set({ deleted_at: new Date().toISOString() })
        .where(eq(memos.id, input.id));
      return { ok: true };
    }),

  restore: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { memos } = schema;
      await db
        .update(memos)
        .set({ deleted_at: null })
        .where(eq(memos.id, input.id));
      return { ok: true };
    }),

  purge: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { memos } = schema;
      await db.delete(memos).where(eq(memos.id, input.id));
      return { ok: true };
    }),
});
