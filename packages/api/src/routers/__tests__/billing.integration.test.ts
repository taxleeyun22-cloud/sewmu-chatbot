/**
 * Phase D3 (2026-05-21): billing router 통합 테스트.
 *
 * tRPC caller 통해 router 호출 → in-memory D1 검증.
 * audit log 자동 기록 + RBAC + Zod 검증 + JSON sanitize.
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller } from './helpers';

setupDbMocks();

describe('billing router (integration)', () => {
  describe('create', () => {
    it('inserts invoice with required fields + audit log', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });

      const r = await caller.billing.create({
        business_id: 100,
        year: 2025,
        tax_type: '법인세',
        revenue: 850_000_000,
        asset: 1_200_000_000,
        base_fee: 600_000,
        s2_addition: 200_000,
        s3_addition: 500_000,
        discount: 0,
        total_fee: 1_540_000,
        s2_items: [{ name: '4대보험', val: 10_000, qty: 5 }],
        s3_items: [{ code: '112', name: '중특', amt: 10_000_000, rule: 'flat_5', gain: 500_000 }],
        staff_override: false,
      });

      expect(r.ok).toBe(true);
      expect(r.id).toBeGreaterThan(0);

      const row = rawDb.prepare('SELECT * FROM billing_invoices WHERE id = ?').get(r.id) as any;
      expect(row.business_id).toBe(100);
      expect(row.year).toBe(2025);
      expect(row.tax_type).toBe('법인세');
      expect(row.total_fee).toBe(1_540_000);
      expect(row.status).toBe('pending');
      expect(JSON.parse(row.s2_items)).toEqual([{ name: '4대보험', val: 10_000, qty: 5 }]);
      expect(JSON.parse(row.s3_items)[0].code).toBe('112');

      const audit = rawDb
        .prepare(`SELECT * FROM audit_logs WHERE action = 'billing.create' ORDER BY id DESC LIMIT 1`)
        .get() as any;
      expect(audit).toBeTruthy();
      expect(audit.target_id).toBe(r.id);
    });

    it('rejects when neither business_id nor user_id provided', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      await expect(
        caller.billing.create({
          year: 2025,
          tax_type: '종소세',
          revenue: 0,
          asset: 0,
          base_fee: 0,
          s3_addition: 0,
          discount: 0,
          total_fee: 0,
          s2_items: [],
          s3_items: [],
          staff_override: false,
        } as never),
      ).rejects.toThrow();
    });

    it('rejects unauthenticated caller (adminProcedure gate)', async () => {
      const { caller } = await makeCaller({ isOwner: false, isAdmin: false, userId: null });
      await expect(
        caller.billing.create({
          business_id: 1,
          year: 2025,
          tax_type: '법인세',
          revenue: 0,
          asset: 0,
          base_fee: 0,
          s3_addition: 0,
          discount: 0,
          total_fee: 0,
          s2_items: [],
          s3_items: [],
          staff_override: false,
        }),
      ).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('returns active invoices (deleted_at IS NULL) with business JOIN', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      rawDb
        .prepare(`INSERT INTO businesses (id, company_name) VALUES (?, ?)`)
        .run(50, '(주)테스트');
      rawDb
        .prepare(
          `INSERT INTO billing_invoices (business_id, year, tax_type, total_fee, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(50, 2025, '법인세', 1_000_000, 'pending', '2026-05-21 10:00');
      rawDb
        .prepare(
          `INSERT INTO billing_invoices (business_id, year, tax_type, total_fee, status, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(50, 2024, '법인세', 500_000, 'paid', '2025-05-21 10:00', '2026-01-01');

      const r = await caller.billing.list({ limit: 100 });
      expect(r.invoices.length).toBe(1);
      expect(r.invoices[0].business_name).toBe('(주)테스트');
      expect(r.invoices[0].total_fee).toBe(1_000_000);
    });

    it('filters by status / year / tax_type', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      rawDb
        .prepare(`INSERT INTO billing_invoices (business_id, year, tax_type, total_fee, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(1, 2025, '법인세', 100, 'pending', 'a');
      rawDb
        .prepare(`INSERT INTO billing_invoices (business_id, year, tax_type, total_fee, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(1, 2025, '법인세', 200, 'paid', 'b');
      rawDb
        .prepare(`INSERT INTO billing_invoices (business_id, year, tax_type, total_fee, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(1, 2024, '종소세', 300, 'pending', 'c');

      const paidOnly = await caller.billing.list({ status: 'paid' });
      expect(paidOnly.invoices.length).toBe(1);
      expect(paidOnly.invoices[0].total_fee).toBe(200);

      const y2024 = await caller.billing.list({ year: 2024 });
      expect(y2024.invoices.length).toBe(1);
      expect(y2024.invoices[0].tax_type).toBe('종소세');
    });
  });

  describe('byId', () => {
    it('returns single invoice + parsed s2/s3 items', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      rawDb
        .prepare(
          `INSERT INTO billing_invoices (business_id, year, tax_type, s2_items, s3_items, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          1,
          2025,
          '법인세',
          JSON.stringify([{ name: '4대보험', val: 10_000, qty: 3 }]),
          JSON.stringify([{ code: '112', name: '중특', amt: 1_000_000, rule: 'flat_5' }]),
          'now',
        );
      const id = (rawDb.prepare(`SELECT id FROM billing_invoices LIMIT 1`).get() as any).id;

      const r = await caller.billing.byId({ id });
      expect(r.invoice).toBeTruthy();
      expect(r.invoice!.s2_items_parsed).toEqual([{ name: '4대보험', val: 10_000, qty: 3 }]);
      expect(r.invoice!.s3_items_parsed[0].code).toBe('112');
    });

    it('returns null for deleted', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      rawDb
        .prepare(`INSERT INTO billing_invoices (deleted_at, created_at) VALUES (?, ?)`)
        .run('2026-01-01', 'now');
      const id = (rawDb.prepare(`SELECT id FROM billing_invoices LIMIT 1`).get() as any).id;
      const r = await caller.billing.byId({ id });
      expect(r.invoice).toBeNull();
    });
  });

  describe('update', () => {
    it('partial update + auto sent_at on status=sent', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      rawDb
        .prepare(`INSERT INTO billing_invoices (business_id, year, status, created_at) VALUES (?, ?, ?, ?)`)
        .run(1, 2025, 'pending', 'a');
      const id = (rawDb.prepare(`SELECT id FROM billing_invoices LIMIT 1`).get() as any).id;

      const r = await caller.billing.update({ id, data: { status: 'sent' } });
      expect(r.ok).toBe(true);

      const row = rawDb.prepare(`SELECT * FROM billing_invoices WHERE id = ?`).get(id) as any;
      expect(row.status).toBe('sent');
      expect(row.sent_at).toBeTruthy();
    });

    it('auto paid_at on status=paid', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      rawDb
        .prepare(`INSERT INTO billing_invoices (status, created_at) VALUES (?, ?)`)
        .run('sent', 'a');
      const id = (rawDb.prepare(`SELECT id FROM billing_invoices LIMIT 1`).get() as any).id;
      await caller.billing.update({ id, data: { status: 'paid' } });
      const row = rawDb.prepare(`SELECT * FROM billing_invoices WHERE id = ?`).get(id) as any;
      expect(row.status).toBe('paid');
      expect(row.paid_at).toBeTruthy();
    });
  });

  describe('remove (soft delete)', () => {
    it('sets deleted_at + audit log', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      rawDb.prepare(`INSERT INTO billing_invoices (created_at) VALUES (?)`).run('a');
      const id = (rawDb.prepare(`SELECT id FROM billing_invoices LIMIT 1`).get() as any).id;

      const r = await caller.billing.remove({ id });
      expect(r.ok).toBe(true);

      const row = rawDb.prepare(`SELECT * FROM billing_invoices WHERE id = ?`).get(id) as any;
      expect(row.deleted_at).toBeTruthy();

      const audit = rawDb
        .prepare(`SELECT * FROM audit_logs WHERE action = 'billing.remove' LIMIT 1`)
        .get() as any;
      expect(audit).toBeTruthy();
    });
  });

  describe('template', () => {
    it('templateGet returns null when not set', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.billing.templateGet();
      expect(r.template).toBeNull();
    });

    it('templateSave upsert + templateGet returns parsed JSON (s2_options 보존)', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const r = await caller.billing.templateSave({
        greeting: '평소 깊은 신뢰를...',
        bank_info: '하나은행 010-1234-5678',
        signature_text: '세무사 이재윤',
        fee_rule_corp: {
          tariff: [
            [0, 300_000, 0],
            [500_000_000, 500_000, 0.05],
          ],
        },
        /* 사장님 명령 (2026-05-21): 양식 s2_options 가 새 청구서로 그대로 가야 함 — round-trip 검증 */
        fee_rule_indv: {
          tariff: [[0, 200_000, 0]],
          s2_options: [
            { name: '타소득 합산', type: 'direct', val: 0 },
            { name: '4대보험 (자영업자)', type: 'unit', val: 10_000 },
          ],
        },
      });
      expect(r.ok).toBe(true);

      const t = await caller.billing.templateGet();
      expect(t.template).toBeTruthy();
      expect(t.template!.greeting).toBe('평소 깊은 신뢰를...');
      expect((t.template!.fee_rule_corp as { tariff: number[][] }).tariff[0]).toEqual([0, 300_000, 0]);
      /* 양식 → 새 청구서 SSoT: s2_options 가 저장·조회 round-trip 에서 그대로 보존 */
      const indv = t.template!.fee_rule_indv as { s2_options: Array<{ name: string; val: number }> };
      expect(indv.s2_options).toHaveLength(2);
      expect(indv.s2_options[0].name).toBe('타소득 합산');
      expect(indv.s2_options[1].name).toBe('4대보험 (자영업자)');
      expect(indv.s2_options[1].val).toBe(10_000);
    });
  });
});
