/**
 * Phase Next-Day15 (2026-05-09): filings router 본격 Drizzle.
 * 기존 functions/api/admin-filings.js 마이그레이션.
 * 사장님 명세 (2026-05-07): 종소세·법인세 신고 결재 검토표.
 */
import { z } from 'zod';
import { eq, and, isNull, desc, sql, or } from 'drizzle-orm';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';
import { FilingType } from '@sewmu/types';

const ReviewStatus = z.enum(['작성중', '결재대기', '보관완료']);

export const filingsRouter = router({
  /** Owner (Person/Business) 별 Filing list. fiscal_year desc. */
  list: adminProcedure
    .input(
      z.object({
        owner_type: z.enum(['Person', 'Business']).optional(),
        owner_id: z.number().int().positive().optional(),
        room_id: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings } = schema;

      const conditions = [
        or(isNull(filings.deleted_at), eq(filings.deleted_at, ''))!,
      ];

      if (input.owner_type && input.owner_id) {
        conditions.push(eq(filings.owner_type, input.owner_type));
        conditions.push(eq(filings.owner_id, input.owner_id));
      }

      const list = await db
        .select()
        .from(filings)
        .where(and(...conditions))
        .orderBy(desc(filings.fiscal_year), desc(filings.id))
        .limit(input.limit);

      return { filings: list };
    }),

  /** 상세 1건 + 작년 Case 자동 참조. */
  byId: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings } = schema;

      const f = await db
        .select()
        .from(filings)
        .where(
          and(
            eq(filings.id, input.id),
            or(isNull(filings.deleted_at), eq(filings.deleted_at, ''))!,
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!f) {
        return { filing: null, previous: null };
      }

      /* 작년 Case 자동 참조 (같은 owner + type, fiscal_year - 1) */
      const prev = await db
        .select()
        .from(filings)
        .where(
          and(
            eq(filings.type, f.type),
            eq(filings.owner_type, f.owner_type),
            eq(filings.owner_id, f.owner_id),
            eq(filings.fiscal_year, f.fiscal_year - 1),
            or(isNull(filings.deleted_at), eq(filings.deleted_at, ''))!,
            sql`${filings.id} != ${input.id}`,
          ),
        )
        .orderBy(desc(filings.id))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      return { filing: f, previous: prev };
    }),

  /** 새 Filing 생성. */
  create: adminProcedure
    .input(
      z.object({
        type: FilingType,
        fiscal_year: z.number().int(),
        owner_type: z.enum(['Person', 'Business']),
        owner_id: z.number().int().positive(),
        included_business_ids: z.array(z.number().int().positive()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings } = schema;

      const now = new Date().toISOString();
      const r = await db
        .insert(filings)
        .values({
          type: input.type,
          fiscal_year: input.fiscal_year,
          owner_type: input.owner_type,
          owner_id: input.owner_id,
          included_business_ids: input.included_business_ids
            ? JSON.stringify(input.included_business_ids)
            : null,
          review_status: '작성중',
          author_user_id: ctx.auth.userId,
          created_at: now,
          updated_at: now,
        })
        .returning({ id: filings.id });

      return { ok: true, id: r[0]?.id ?? 0 };
    }),

  /** auto_fields 자동 저장 (사장님이 입력하는 즉시). */
  patchFields: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        auto_fields: z.record(z.unknown()).optional(),
        reviewer_comment: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings } = schema;

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.auto_fields !== undefined) {
        updates.auto_fields = JSON.stringify(input.auto_fields);
      }
      if (input.reviewer_comment !== undefined) {
        updates.reviewer_comment = input.reviewer_comment;
      }

      await db.update(filings).set(updates).where(eq(filings.id, input.id));
      return { ok: true };
    }),

  /** 결재 흐름 (작성중 → 결재대기 → 보관완료). */
  setStatus: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: ReviewStatus,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings } = schema;

      const updates: Record<string, unknown> = {
        review_status: input.status,
        updated_at: new Date().toISOString(),
      };
      if (input.status === '보관완료') {
        updates.reviewer_user_id = ctx.auth.userId;
        updates.reviewed_at = new Date().toISOString();
      }

      await db.update(filings).set(updates).where(eq(filings.id, input.id));
      return { ok: true };
    }),

  /** Soft delete. */
  remove: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { filings } = schema;

      await db
        .update(filings)
        .set({ deleted_at: new Date().toISOString() })
        .where(eq(filings.id, input.id));
      return { ok: true };
    }),

  /** 부가세/원천세 체크리스트 (간단 todo). */
  taxList: adminProcedure
    .input(
      z.object({
        business_id: z.number().int().positive().optional(),
        user_id: z.number().int().positive().optional(),
        period_year: z.number().int().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { taxFilings } = schema;

      const conditions = [];
      if (input.business_id) conditions.push(eq(taxFilings.business_id, input.business_id));
      if (input.user_id) conditions.push(eq(taxFilings.user_id, input.user_id));
      if (input.period_year) conditions.push(eq(taxFilings.period_year, input.period_year));

      const q = conditions.length
        ? db.select().from(taxFilings).where(and(...conditions))
        : db.select().from(taxFilings);

      const list = await q
        .orderBy(desc(taxFilings.due_date))
        .limit(input.limit);

      return { taxFilings: list };
    }),
});
