/**
 * Phase X (2026-05-20): @sewmu/types/billing — 청구서 시스템 Zod schemas + TS 타입.
 *
 * 사장님 명령: "구글 개발자처럼 — TS 타입 정의 확실히".
 *
 * 사용:
 *   import { InvoiceSchema, type Invoice, type S2Item } from '@sewmu/types/billing';
 *
 * Drizzle inferred types 와 별도 — API 입력 / 검증용.
 * 옛 인프라 (functions/api/billing-invoices.js) 와 새 인프라 (apps/admin) 양쪽 공유.
 */
import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Section 2 — 활증업무 (양식 선택 + 직접 입력)
// ────────────────────────────────────────────────────────────────────────────

export const S2ItemSchema = z.object({
  name: z.string().min(1).max(100),
  val: z.number().min(0), // 단가 (원)
  qty: z.number().min(0).default(1), // 건수
});
export type S2Item = z.infer<typeof S2ItemSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Section 3 — 세액공제·감면 (카탈로그)
// ────────────────────────────────────────────────────────────────────────────

export const S3RuleSchema = z.enum(['none', 'flat_5', 'progressive_u']);
export type S3Rule = z.infer<typeof S3RuleSchema>;

export const S3ItemSchema = z.object({
  code: z.string().min(1).max(50), // 카탈로그 code (예: '112', 'JTL_7', 'SOD_56')
  name: z.string().min(1).max(200),
  amt: z.number().min(0), // 감면액 (원)
  rule: S3RuleSchema.default('progressive_u'),
  gain: z.number().min(0).optional(), // 가산액 (계산 결과, 옵션)
});
export type S3Item = z.infer<typeof S3ItemSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 청구서 (Invoice)
// ────────────────────────────────────────────────────────────────────────────

export const InvoiceStatusSchema = z.enum(['pending', 'sent', 'paid']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const TaxTypeSchema = z.enum(['종소세', '법인세', '부가세']);
export type TaxType = z.infer<typeof TaxTypeSchema>;

/**
 * 청구서 생성 (POST /api/billing-invoices).
 * business_id 또는 user_id 중 하나 필수.
 */
export const NewInvoiceSchema = z
  .object({
    business_id: z.coerce.number().int().positive().optional(),
    user_id: z.coerce.number().int().positive().optional(),
    filing_id: z.coerce.number().int().positive().optional(),
    /* 사장님 보고 (2026-05-21): 'year: undefined' 발행 실패. 검토표 prefill 의
     * fiscal_year 가 string 일 수 있음. coerce 로 string→number 안전 변환. */
    year: z.coerce.number().int().min(2000).max(2100),
    tax_type: TaxTypeSchema,

    revenue: z.coerce.number().min(0).default(0),
    asset: z.coerce.number().min(0).default(0),
    biz_type: z.string().max(100).optional(),
    basic_type: z.string().max(100).optional(),

    base_fee: z.coerce.number().min(0).default(0),
    s2_addition: z.coerce.number().min(0).default(0),
    s3_addition: z.coerce.number().min(0).default(0),
    discount: z.coerce.number().min(0).default(0), // 사장님 룰: 항상 수기 입력
    total_fee: z.coerce.number().min(0).default(0),

    s2_items: z.array(S2ItemSchema).default([]),
    s3_items: z.array(S3ItemSchema).default([]),

    staff_user_id: z.number().int().positive().optional(),
    staff_override: z.boolean().default(false),
    note: z.string().max(1000).optional(),
  })
  .refine((data) => data.business_id !== undefined || data.user_id !== undefined, {
    message: 'business_id 또는 user_id 중 하나 필수',
  });
export type NewInvoice = z.infer<typeof NewInvoiceSchema>;

/** 청구서 update (PATCH). 부분 변경 — 모든 필드 선택. */
export const InvoiceUpdateSchema = z.object({
  revenue: z.number().min(0).optional(),
  asset: z.number().min(0).optional(),
  biz_type: z.string().max(100).optional(),
  basic_type: z.string().max(100).optional(),
  base_fee: z.number().min(0).optional(),
  s2_addition: z.number().min(0).optional(),
  s3_addition: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  total_fee: z.number().min(0).optional(),
  s2_items: z.array(S2ItemSchema).optional(),
  s3_items: z.array(S3ItemSchema).optional(),
  staff_user_id: z.number().int().positive().nullable().optional(),
  staff_override: z.boolean().optional(),
  status: InvoiceStatusSchema.optional(),
  sent_at: z.string().optional(),
  paid_at: z.string().optional(),
  paid_amount: z.number().min(0).optional(),
  note: z.string().max(1000).optional(),
});
export type InvoiceUpdate = z.infer<typeof InvoiceUpdateSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 청구서 양식 (Template, 단일 row id=1)
// ────────────────────────────────────────────────────────────────────────────

export const FeeRuleRowSchema = z.tuple([
  z.number(), // 수입금액 임계 (원)
  z.number(), // 기본보수 (원)
  z.number(), // 가산률 (%)
]);
export type FeeRuleRow = z.infer<typeof FeeRuleRowSchema>;

/**
 * 활증업무 옵션 (양식 SSoT) — 사장님 명령 (2026-05-21): "개인은 양식추가에 근로소득
 * 합산추가 이런거 넣고 금액넣을수있게".
 *
 * 사장님이 양식에 자주 쓰는 활증업무 (근로소득 합산 / 4대보험 / 신용카드 검토 등)
 * 등록 → 새 청구서 발행 시 S2PickerModal 이 이 list 에서 선택 + 단가 prefill.
 *
 * type:
 *   - 'unit'   = 건당 (val × 건수)
 *   - 'rate'   = 기본보수 × val% (자동)
 *   - 'direct' = 1회 직접 (val 그대로)
 */
export const FeeRuleOptionSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['unit', 'rate', 'direct']).default('unit'),
  val: z.number().min(0).default(0),
  desc: z.string().max(200).optional(),
});
export type FeeRuleOption = z.infer<typeof FeeRuleOptionSchema>;

export const FeeRuleSchema = z.object({
  tariff: z.array(FeeRuleRowSchema),
  s2_options: z.array(FeeRuleOptionSchema).optional(),  // 활증업무 옵션 list
});
export type FeeRule = z.infer<typeof FeeRuleSchema>;

export const BillingTemplateSchema = z.object({
  greeting: z.string().max(2000).optional(),
  bank_info: z.string().max(500).optional(),
  office_address: z.string().max(300).optional(),
  office_phone: z.string().max(100).optional(),
  signature_text: z.string().max(200).optional(),
  fee_rule_indv: FeeRuleSchema.optional(),
  fee_rule_corp: FeeRuleSchema.optional(),
});
export type BillingTemplate = z.infer<typeof BillingTemplateSchema>;
