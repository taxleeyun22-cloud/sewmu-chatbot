/**
 * Phase D2 (2026-05-21): billing router — 청구서 시스템 tRPC.
 *
 * 사장님 명령: "구글식으로 업데이트". 옛 functions/api/billing-invoices.js 마이그레이션.
 * Drizzle ORM + Zod 검증 + audit log + RBAC (adminProcedure).
 */
import { z } from 'zod';
import { eq, and, isNull, desc, sql, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';
import { audit } from '../audit';
import { ensureStaffColumns, type D1Like } from './staff';
import {
  NewInvoiceSchema,
  InvoiceUpdateSchema,
  BillingTemplateSchema,
  S2ItemSchema,
  S3ItemSchema,
} from '@sewmu/types';

/** s2_items / s3_items JSON parse 헬퍼 (응답 시 클라이언트 편의) */
function parseJsonArray(s: string | null | undefined): unknown[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Lazy migration — 옛 admin 패턴 (사장님 명령: "구글식 + lazy ALTER").
 * tRPC 첫 호출 시 D1 에 테이블 없으면 자동 생성. 이미 있으면 IF NOT EXISTS 로 skip.
 *
 * 사장님 보고 (2026-05-21): "D1_ERROR: no such table: billing_invoices".
 * 원인: Drizzle schema 만 정의됐고 prod D1 에 실제 테이블 X (드리즐 migration 안 돌림).
 */
async function ensureBillingTables(d1: { prepare: (sql: string) => { run: () => Promise<unknown> } }) {
  try {
    await d1
      .prepare(
        `CREATE TABLE IF NOT EXISTS billing_invoices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          business_id INTEGER, user_id INTEGER, filing_id INTEGER,
          year INTEGER, tax_type TEXT,
          issue_date TEXT, due_date TEXT,
          revenue INTEGER, asset INTEGER, biz_type TEXT, basic_type TEXT,
          base_fee INTEGER DEFAULT 0, s2_addition INTEGER DEFAULT 0,
          s3_addition INTEGER DEFAULT 0, discount INTEGER DEFAULT 0, total_fee INTEGER DEFAULT 0,
          s2_items TEXT, s3_items TEXT,
          staff_user_id INTEGER, staff_override INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending', sent_at TEXT, paid_at TEXT, paid_amount INTEGER,
          note TEXT, created_by_user_id INTEGER,
          created_at TEXT, updated_at TEXT, deleted_at TEXT
        )`,
      )
      .run();
  } catch {}
  try {
    await d1
      .prepare(
        `CREATE TABLE IF NOT EXISTS billing_template (
          id INTEGER PRIMARY KEY,
          greeting TEXT, bank_info TEXT, office_address TEXT, office_phone TEXT,
          signature_text TEXT, fee_rule_indv TEXT, fee_rule_corp TEXT, updated_at TEXT
        )`,
      )
      .run();
  } catch {}
  /* lazy migration (사장님 보고 2026-05-29): 기존 테이블에 발행일자·납부기한 컬럼 추가.
   * CREATE TABLE IF NOT EXISTS 는 기존 테이블에 새 컬럼을 안 더하므로 ALTER 필수. 이미 있으면 catch. */
  try { await d1.prepare(`ALTER TABLE billing_invoices ADD COLUMN issue_date TEXT`).run(); } catch {}
  try { await d1.prepare(`ALTER TABLE billing_invoices ADD COLUMN due_date TEXT`).run(); } catch {}
  try { await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_business ON billing_invoices(business_id, year DESC)`).run(); } catch {}
  try { await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_status ON billing_invoices(status, created_at DESC)`).run(); } catch {}
  try { await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_staff ON billing_invoices(staff_user_id, status)`).run(); } catch {}
  try { await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_year ON billing_invoices(year, tax_type)`).run(); } catch {}
}

export const billingRouter = router({
  /** 청구서 list — 필터 + 담당자별 그룹 카운트 */
  list: adminProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'sent', 'paid']).optional(),
        staff_id: z.number().int().positive().optional(),
        year: z.number().int().optional(),
        business_id: z.number().int().positive().optional(),
        user_id: z.number().int().positive().optional(),
        tax_type: z.enum(['종소세', '법인세', '부가세']).optional(),
        limit: z.number().int().min(1).max(1000).default(500),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureBillingTables(ctx.db as { prepare: (sql: string) => { run: () => Promise<unknown> } });
      const db = drizzle(ctx.db);
      const { billingInvoices, businesses, users } = schema;
      /* 담당자 직원(users) 별칭 JOIN — 청구서.staff_user_id → users.id → staff_name.
       * 사장님 명령 (2026-05-25): 청구서 목록에 "담당자 #숫자" 대신 직원 이름 표시. */
      const staffUsers = alias(users, 'staff_users');

      const conditions = [
        or(isNull(billingInvoices.deleted_at), eq(billingInvoices.deleted_at, ''))!,
      ];
      if (input.status) conditions.push(eq(billingInvoices.status, input.status));
      if (input.staff_id) conditions.push(eq(billingInvoices.staff_user_id, input.staff_id));
      if (input.year) conditions.push(eq(billingInvoices.year, input.year));
      if (input.business_id) conditions.push(eq(billingInvoices.business_id, input.business_id));
      if (input.user_id) conditions.push(eq(billingInvoices.user_id, input.user_id));
      if (input.tax_type) conditions.push(eq(billingInvoices.tax_type, input.tax_type));

      const rows = await db
        .select({
          id: billingInvoices.id,
          business_id: billingInvoices.business_id,
          user_id: billingInvoices.user_id,
          filing_id: billingInvoices.filing_id,
          year: billingInvoices.year,
          tax_type: billingInvoices.tax_type,
          revenue: billingInvoices.revenue,
          base_fee: billingInvoices.base_fee,
          s2_addition: billingInvoices.s2_addition,
          s3_addition: billingInvoices.s3_addition,
          discount: billingInvoices.discount,
          total_fee: billingInvoices.total_fee,
          staff_user_id: billingInvoices.staff_user_id,
          staff_override: billingInvoices.staff_override,
          status: billingInvoices.status,
          sent_at: billingInvoices.sent_at,
          paid_at: billingInvoices.paid_at,
          paid_amount: billingInvoices.paid_amount,
          created_at: billingInvoices.created_at,
          updated_at: billingInvoices.updated_at,
          business_name: businesses.company_name,
          user_real_name: users.real_name,
          user_name: users.name,
          staff_name: sql<string | null>`COALESCE(${staffUsers.real_name}, ${staffUsers.name})`.as('staff_name'),
        })
        .from(billingInvoices)
        .leftJoin(businesses, eq(billingInvoices.business_id, businesses.id))
        .leftJoin(users, eq(billingInvoices.user_id, users.id))
        .leftJoin(staffUsers, eq(billingInvoices.staff_user_id, staffUsers.id))
        .where(and(...conditions))
        .orderBy(desc(billingInvoices.created_at))
        .limit(input.limit);

      return { invoices: rows };
    }),

  /** 청구서 단건 + JOIN + JSON parse */
  byId: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await ensureBillingTables(ctx.db as { prepare: (sql: string) => { run: () => Promise<unknown> } });
      const db = drizzle(ctx.db);
      const { billingInvoices, businesses, users } = schema;

      const inv = await db
        .select()
        .from(billingInvoices)
        .where(
          and(
            eq(billingInvoices.id, input.id),
            or(isNull(billingInvoices.deleted_at), eq(billingInvoices.deleted_at, ''))!,
          ),
        )
        .get();

      if (!inv || inv.id == null) return { invoice: null };

      /* JOIN for names (별도 select — drizzle proxy nested 호환) */
      let business_name: string | null = null;
      let user_name: string | null = null;
      if (inv.business_id) {
        const b = await db.select().from(businesses).where(eq(businesses.id, inv.business_id)).get();
        business_name = b?.company_name ?? null;
      }
      if (inv.user_id) {
        const u = await db.select().from(users).where(eq(users.id, inv.user_id)).get();
        user_name = (u?.real_name as string | null) || (u?.name as string | null) || null;
      }

      return {
        invoice: {
          ...inv,
          business_name,
          user_name,
          s2_items_parsed: parseJsonArray(inv.s2_items),
          s3_items_parsed: parseJsonArray(inv.s3_items),
        },
      };
    }),

  /** 청구서 생성 (POST). 담당자 자동 상속(사장님 명령 2026-05-25): 입력에 staff_user_id 없으면
   *  업체(business)→사람(user) 순으로 lookup. staff_override=true 면 상속 안 함(수동 강제). */
  create: adminProcedure
    .input(NewInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      await ensureBillingTables(ctx.db as { prepare: (sql: string) => { run: () => Promise<unknown> } });
      await ensureStaffColumns(ctx.db as unknown as D1Like);
      const db = drizzle(ctx.db);
      const { billingInvoices } = schema;
      const now = new Date().toISOString();

      /* 담당자 상속 — 입력값 우선, 없으면 업체/사람의 staff_user_id lookup (raw SQL — 컬럼이 Drizzle 미포함) */
      let inheritedStaff: number | null = input.staff_user_id ?? null;
      if (inheritedStaff == null && !input.staff_override) {
        const d1raw = ctx.db as unknown as { prepare: (s: string) => { bind: (...a: unknown[]) => { first: () => Promise<unknown> } } };
        if (input.business_id) {
          const row = (await d1raw.prepare(`SELECT staff_user_id FROM businesses WHERE id = ?`).bind(input.business_id).first()) as { staff_user_id?: number | null } | null;
          if (row && row.staff_user_id) inheritedStaff = row.staff_user_id;
        }
        if (inheritedStaff == null && input.user_id) {
          const row = (await d1raw.prepare(`SELECT staff_user_id FROM users WHERE id = ?`).bind(input.user_id).first()) as { staff_user_id?: number | null } | null;
          if (row && row.staff_user_id) inheritedStaff = row.staff_user_id;
        }
      }

      const r = await db
        .insert(billingInvoices)
        .values({
          business_id: input.business_id ?? null,
          user_id: input.user_id ?? null,
          filing_id: input.filing_id ?? null,
          year: input.year,
          tax_type: input.tax_type,
          issue_date: input.issue_date ?? now.slice(0, 10),
          due_date: input.due_date ?? null,
          revenue: input.revenue,
          asset: input.asset,
          biz_type: input.biz_type ?? null,
          basic_type: input.basic_type ?? null,
          base_fee: input.base_fee,
          s2_addition: input.s2_addition ?? 0,
          s3_addition: input.s3_addition,
          discount: input.discount,
          total_fee: input.total_fee,
          s2_items: input.s2_items.length ? JSON.stringify(input.s2_items) : null,
          s3_items: input.s3_items.length ? JSON.stringify(input.s3_items) : null,
          staff_user_id: inheritedStaff,
          staff_override: input.staff_override ? 1 : 0,
          status: 'pending',
          note: input.note ?? null,
          created_by_user_id: ctx.auth.userId,
          created_at: now,
          updated_at: now,
        })
        .returning({ id: billingInvoices.id });

      const newId = r[0]?.id ?? 0;

      await audit(ctx, 'billing.create', {
        target_type: 'billing_invoice',
        target_id: newId,
        after: { ...input, id: newId },
      });

      return { ok: true, id: newId };
    }),

  /** 청구서 부분 update (PATCH) — 발송·수금·금액·항목 등 */
  update: adminProcedure
    .input(z.object({ id: z.number().int().positive(), data: InvoiceUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      await ensureBillingTables(ctx.db as { prepare: (sql: string) => { run: () => Promise<unknown> } });
      const db = drizzle(ctx.db);
      const { billingInvoices } = schema;
      const now = new Date().toISOString();

      const before = await db
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.id, input.id))
        .get();
      if (!before) return { ok: false, error: 'not found' };

      const patch: Record<string, unknown> = {};
      const d = input.data;
      if (d.issue_date !== undefined) patch.issue_date = d.issue_date;
      if (d.due_date !== undefined) patch.due_date = d.due_date;
      if (d.revenue !== undefined) patch.revenue = d.revenue;
      if (d.asset !== undefined) patch.asset = d.asset;
      if (d.biz_type !== undefined) patch.biz_type = d.biz_type;
      if (d.basic_type !== undefined) patch.basic_type = d.basic_type;
      if (d.base_fee !== undefined) patch.base_fee = d.base_fee;
      if (d.s2_addition !== undefined) patch.s2_addition = d.s2_addition;
      if (d.s3_addition !== undefined) patch.s3_addition = d.s3_addition;
      if (d.discount !== undefined) patch.discount = d.discount;
      if (d.total_fee !== undefined) patch.total_fee = d.total_fee;
      if (d.s2_items !== undefined)
        patch.s2_items = d.s2_items.length ? JSON.stringify(d.s2_items) : null;
      if (d.s3_items !== undefined)
        patch.s3_items = d.s3_items.length ? JSON.stringify(d.s3_items) : null;
      if (d.staff_user_id !== undefined) patch.staff_user_id = d.staff_user_id;
      if (d.staff_override !== undefined) patch.staff_override = d.staff_override ? 1 : 0;
      if (d.note !== undefined) patch.note = d.note;
      if (d.paid_amount !== undefined) patch.paid_amount = d.paid_amount;
      /* 상태 변경 시 sent_at / paid_at 자동 timestamp */
      if (d.status !== undefined) {
        patch.status = d.status;
        if (d.status === 'sent' && !d.sent_at) patch.sent_at = now;
        if (d.status === 'paid' && !d.paid_at) patch.paid_at = now;
      }
      if (d.sent_at !== undefined) patch.sent_at = d.sent_at;
      if (d.paid_at !== undefined) patch.paid_at = d.paid_at;
      patch.updated_at = now;

      await db.update(billingInvoices).set(patch).where(eq(billingInvoices.id, input.id));

      const after = await db
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.id, input.id))
        .get();

      await audit(ctx, 'billing.update', {
        target_type: 'billing_invoice',
        target_id: input.id,
        before: before as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
      });

      return { ok: true };
    }),

  /** 청구서 soft delete */
  remove: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ensureBillingTables(ctx.db as { prepare: (sql: string) => { run: () => Promise<unknown> } });
      const db = drizzle(ctx.db);
      const { billingInvoices } = schema;
      const now = new Date().toISOString();

      const before = await db
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.id, input.id))
        .get();
      if (!before) return { ok: false, error: 'not found' };

      await db
        .update(billingInvoices)
        .set({ deleted_at: now, updated_at: now })
        .where(eq(billingInvoices.id, input.id));

      await audit(ctx, 'billing.remove', {
        target_type: 'billing_invoice',
        target_id: input.id,
        before: before as unknown as Record<string, unknown>,
      });

      return { ok: true };
    }),

  /** 청구서 양식 (Template) 조회 — 단일 row id=1 */
  templateGet: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { billingTemplate } = schema;
    const row = await db.select().from(billingTemplate).where(eq(billingTemplate.id, 1)).get();
    if (!row || row.id == null) return { template: null };
    let fee_rule_indv: unknown = null;
    let fee_rule_corp: unknown = null;
    try {
      fee_rule_indv = row.fee_rule_indv ? JSON.parse(row.fee_rule_indv) : null;
    } catch {}
    try {
      fee_rule_corp = row.fee_rule_corp ? JSON.parse(row.fee_rule_corp) : null;
    } catch {}
    return { template: { ...row, fee_rule_indv, fee_rule_corp } };
  }),

  /** 청구서 양식 저장 (upsert id=1) */
  templateSave: adminProcedure
    .input(BillingTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      await ensureBillingTables(ctx.db as { prepare: (sql: string) => { run: () => Promise<unknown> } });
      const db = drizzle(ctx.db);
      const { billingTemplate } = schema;
      const now = new Date().toISOString();

      const beforeRaw = await db
        .select()
        .from(billingTemplate)
        .where(eq(billingTemplate.id, 1))
        .get();
      const before = beforeRaw && beforeRaw.id != null ? beforeRaw : null;

      const values = {
        id: 1 as const,
        greeting: input.greeting ?? null,
        bank_info: input.bank_info ?? null,
        office_address: input.office_address ?? null,
        office_phone: input.office_phone ?? null,
        signature_text: input.signature_text ?? null,
        fee_rule_indv: input.fee_rule_indv ? JSON.stringify(input.fee_rule_indv) : null,
        fee_rule_corp: input.fee_rule_corp ? JSON.stringify(input.fee_rule_corp) : null,
        updated_at: now,
      };

      if (before) {
        await db.update(billingTemplate).set(values).where(eq(billingTemplate.id, 1));
      } else {
        await db.insert(billingTemplate).values(values);
      }

      await audit(ctx, 'billing.templateSave', {
        target_type: 'billing_template',
        target_id: 1,
        before: before as unknown as Record<string, unknown>,
        after: values as unknown as Record<string, unknown>,
      });

      return { ok: true };
    }),
});
