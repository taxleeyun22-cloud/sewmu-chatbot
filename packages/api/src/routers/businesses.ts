/**
 * Phase Next-Day5 (2026-05-09): businesses router (Drizzle 본격).
 * 기존 functions/api/admin-businesses.js 마이그레이션.
 *
 * 위하고 호환 14필드 + 본·지점 매핑 + soft delete.
 */
import { z } from 'zod';
import { eq, and, isNull, like, or, desc } from 'drizzle-orm';
import { adminProcedure, ownerProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

export const businessesRouter = router({
  list: adminProcedure
    .input(
      z.object({
        status: z.enum(['all', 'active', 'closed', 'terminated']).default('all'),
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businesses } = schema;
      const conditions = [
        or(isNull(businesses.deleted_at), eq(businesses.deleted_at, ''))!,
      ];
      if (input.status !== 'all') {
        conditions.push(eq(businesses.status, input.status));
      }
      if (input.search) {
        const pat = `%${input.search}%`;
        conditions.push(
          or(
            like(businesses.company_name, pat),
            like(businesses.business_number, pat),
            like(businesses.ceo_name, pat),
            like(businesses.corporate_number, pat),
          )!,
        );
      }
      const list = await db
        .select()
        .from(businesses)
        .where(and(...conditions))
        .orderBy(desc(businesses.created_at))
        .limit(input.limit);

      const all = list.length;
      const active = list.filter((b) => (b.status || 'active') === 'active').length;
      const closed = list.filter((b) => b.status === 'closed').length;
      const terminated = list.filter((b) => b.status === 'terminated').length;

      return {
        businesses: list,
        counts: { all, active, closed, terminated },
      };
    }),

  get: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businesses } = schema;
      const business = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, input.id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!business) {
        return { business: null, branches: [], parent: null };
      }

      let branches: typeof businesses.$inferSelect[] = [];
      let parent: typeof businesses.$inferSelect | null = null;
      if (business.parent_business_id) {
        parent =
          (await db
            .select()
            .from(businesses)
            .where(eq(businesses.id, business.parent_business_id))
            .limit(1)
            .then((rows) => rows[0])) || null;
      } else {
        branches = await db
          .select()
          .from(businesses)
          .where(
            and(
              eq(businesses.parent_business_id, business.id),
              or(isNull(businesses.deleted_at), eq(businesses.deleted_at, ''))!,
            ),
          );
      }

      return { business, branches, parent };
    }),

  create: adminProcedure
    .input(
      z.object({
        company_name: z.string().min(1),
        business_number: z.string().optional(),
        ceo_name: z.string().optional(),
        company_form: z.string().optional(),
        parent_business_id: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businesses } = schema;
      const now = new Date().toISOString();
      const result = await db
        .insert(businesses)
        .values({
          company_name: input.company_name,
          business_number: input.business_number || null,
          ceo_name: input.ceo_name || null,
          company_form: input.company_form || null,
          parent_business_id: input.parent_business_id || null,
          status: 'active',
          created_at: now,
          updated_at: now,
        })
        .returning({ id: businesses.id });
      return { ok: true, id: result[0]?.id || 0 };
    }),

  delete: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businesses } = schema;
      await db
        .update(businesses)
        .set({ deleted_at: new Date().toISOString() })
        .where(eq(businesses.id, input.id));
      return { ok: true };
    }),
});
