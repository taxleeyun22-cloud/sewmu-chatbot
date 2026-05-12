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
import { audit } from '../audit';

export const businessesRouter = router({
  list: adminProcedure
    .input(
      z.object({
        status: z.enum(['all', 'active', 'closed', 'terminated']).default('all'),
        search: z.string().optional(),
        limit: z.number().min(1).max(2000).default(1000),
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

  /** 위하고 14필드 update (사장님 매일 워크플로). */
  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        patch: z.object({
          company_name: z.string().optional(),
          business_number: z.string().optional(),
          sub_business_number: z.string().optional(),
          corporate_number: z.string().optional(),
          ceo_name: z.string().optional(),
          company_form: z.string().optional(),
          business_category: z.string().optional(),
          industry: z.string().optional(),
          industry_code: z.string().optional(),
          tax_type: z.string().optional(),
          address: z.string().optional(),
          phone: z.string().optional(),
          establishment_date: z.string().optional(),
          closed_date: z.string().optional(),
          fiscal_year_start: z.string().optional(),
          fiscal_year_end: z.string().optional(),
          fiscal_term: z.number().int().optional(),
          contract_date: z.string().optional(),
          hr_year: z.number().int().optional(),
          parent_business_id: z.number().int().positive().nullable().optional(),
          status: z.enum(['active', 'closed', 'terminated']).optional(),
          notes: z.string().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businesses } = schema;
      await db
        .update(businesses)
        .set({ ...input.patch, updated_at: new Date().toISOString() })
        .where(eq(businesses.id, input.id));
      return { ok: true };
    }),

  /** 사장님 매핑 추가 (사람 ↔ 업체). */
  addToUser: adminProcedure
    .input(
      z.object({
        user_id: z.number().int().positive(),
        business_id: z.number().int().positive(),
        is_primary: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businessMembers } = schema;

      const existing = await db
        .select()
        .from(businessMembers)
        .where(
          and(
            eq(businessMembers.user_id, input.user_id),
            eq(businessMembers.business_id, input.business_id),
          ),
        )
        .limit(1);

      const now = new Date().toISOString();
      if (existing[0]) {
        await db
          .update(businessMembers)
          .set({
            is_primary: input.is_primary ? 1 : 0,
            removed_at: null,
          })
          .where(eq(businessMembers.id, existing[0].id));
      } else {
        await db.insert(businessMembers).values({
          user_id: input.user_id,
          business_id: input.business_id,
          is_primary: input.is_primary ? 1 : 0,
          created_at: now,
        });
      }
      return { ok: true };
    }),

  /** 사람 매핑 사업장 (마이페이지 + 거래처 dashboard 사용). */
  byUser: adminProcedure
    .input(z.object({ user_id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businesses, businessMembers } = schema;

      const list = await db
        .select({
          id: businesses.id,
          company_name: businesses.company_name,
          business_number: businesses.business_number,
          ceo_name: businesses.ceo_name,
          company_form: businesses.company_form,
          tax_type: businesses.tax_type,
          status: businesses.status,
          is_primary: businessMembers.is_primary,
        })
        .from(businessMembers)
        .innerJoin(businesses, eq(businessMembers.business_id, businesses.id))
        .where(
          and(
            eq(businessMembers.user_id, input.user_id),
            isNull(businessMembers.removed_at),
            or(isNull(businesses.deleted_at), eq(businesses.deleted_at, ''))!,
          ),
        )
        .orderBy(desc(businessMembers.is_primary));

      return { businesses: list };
    }),

  delete: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businesses } = schema;

      const before = await db
        .select({ company_name: businesses.company_name })
        .from(businesses)
        .where(eq(businesses.id, input.id))
        .limit(1);

      await db
        .update(businesses)
        .set({ deleted_at: new Date().toISOString() })
        .where(eq(businesses.id, input.id));

      await audit(ctx, 'admin:business:delete', {
        target_type: 'business',
        target_id: input.id,
        before: { company_name: before[0]?.company_name },
      });

      return { ok: true };
    }),
});
