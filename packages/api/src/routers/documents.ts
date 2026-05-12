/**
 * Phase Next-Day16 (2026-05-09): documents router 본격 Drizzle.
 * 기존 functions/api/admin-documents.js + upload-doc.js 마이그레이션.
 *
 * 영수증 / 계약서 / 신고서 등 문서 관리 + R2 storage.
 * OCR Vision API 통합은 별도 endpoint (Day 17+).
 */
import { z } from 'zod';
import { eq, and, isNull, desc, sql, or } from 'drizzle-orm';
import { adminProcedure, customerProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

const StatusSchema = z.enum(['pending', 'approved', 'rejected', 'all']);

export const documentsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        status: StatusSchema.default('all'),
        user_id: z.number().int().positive().optional(),
        business_id: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { documents } = schema;

      const conditions = [or(isNull(documents.deleted_at), eq(documents.deleted_at, ''))!];
      if (input.status !== 'all') {
        conditions.push(eq(documents.status, input.status));
      }
      if (input.user_id) {
        conditions.push(eq(documents.user_id, input.user_id));
      }
      if (input.business_id) {
        conditions.push(eq(documents.business_id, input.business_id));
      }

      const list = await db
        .select()
        .from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.created_at))
        .limit(input.limit);

      /* status 카운트 (탭 배지) */
      const counts = await db
        .select({
          status: documents.status,
          c: sql<number>`COUNT(*)`,
        })
        .from(documents)
        .where(or(isNull(documents.deleted_at), eq(documents.deleted_at, ''))!)
        .groupBy(documents.status);

      const countMap: Record<string, number> = {};
      for (const r of counts) {
        countMap[r.status || 'pending'] = r.c;
      }

      return { documents: list, counts: countMap };
    }),

  byId: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { documents } = schema;
      const r = await db.select().from(documents).where(eq(documents.id, input.id)).limit(1);
      return { document: r[0] ?? null };
    }),

  approve: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        vendor: z.string().optional(),
        amount: z.number().optional(),
        receipt_date: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { documents } = schema;

      const updates: Record<string, unknown> = {
        status: 'approved',
        approver_id: ctx.auth.userId,
        approved_at: new Date().toISOString(),
      };
      if (input.vendor !== undefined) updates.vendor = input.vendor;
      if (input.amount !== undefined) updates.amount = input.amount;
      if (input.receipt_date !== undefined) updates.receipt_date = input.receipt_date;
      if (input.category !== undefined) {
        updates.category = input.category;
        updates.category_src = 'manual';
      }

      await db.update(documents).set(updates).where(eq(documents.id, input.id));
      return { ok: true };
    }),

  reject: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { documents } = schema;
      await db
        .update(documents)
        .set({
          status: 'rejected',
          reject_reason: input.reason,
          approver_id: ctx.auth.userId,
          approved_at: new Date().toISOString(),
        })
        .where(eq(documents.id, input.id));
      return { ok: true };
    }),

  /** 거래처가 R2 업로드 완료 후 호출 → documents 테이블 INSERT. */
  upload: customerProcedure
    .input(
      z.object({
        key: z.string(),
        name: z.string(),
        size: z.number(),
        mime: z.string(),
        doc_type: z.string().default('영수증'),
        business_id: z.number().int().positive().optional(),
        room_id: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { documents } = schema;

      const userId = ctx.auth.userId;
      if (!userId) {
        throw new Error('인증 필요');
      }

      const r = await db
        .insert(documents)
        .values({
          user_id: userId,
          business_id: input.business_id ?? null,
          room_id: input.room_id ?? null,
          doc_type: input.doc_type,
          image_key: input.key,
          ocr_status: 'pending',
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .returning({ id: documents.id });

      return { ok: true, document_id: r[0]?.id ?? 0 };
    }),

  /** 거래처 본인 문서 list (마이페이지 영수증함). */
  myList: customerProcedure
    .input(
      z.object({
        status: StatusSchema.optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.auth.userId) return { documents: [] };
      const db = drizzle(ctx.db);
      const { documents } = schema;

      const conditions = [
        eq(documents.user_id, ctx.auth.userId),
        or(isNull(documents.deleted_at), eq(documents.deleted_at, ''))!,
      ];
      if (input.status && input.status !== 'all') {
        conditions.push(eq(documents.status, input.status));
      }

      const list = await db
        .select()
        .from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.created_at))
        .limit(input.limit);

      return { documents: list };
    }),
});
