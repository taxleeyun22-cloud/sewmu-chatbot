/**
 * apps/admin/lib/billing-calc — 청구서 계산·룰 단일 진실 (SSoT).
 *
 * 사장님 명령 (2026-05-21): "프리뷰로 코드 짜놓고 그대로 심은거 아닌가? 왜 달라진거지?"
 * → 그동안 calcBase / calcGain / billable / 누진률이 new/page.tsx, S2PickerModal,
 *   S3PickerModal, InvoicePreview 4곳에 각자 inline 으로 박혀 drift 발생.
 *   이 모듈로 통합 → 한 곳만 고치면 전부 반영 (= 단일 진실).
 *
 * 룰 출처 = billing-preview.js (사장님이 만든 시안의 검증된 로직):
 *   - billable: cat 'general'|'special' → false (자연발생, 청구 제외) / 그 외 true
 *   - rule: 중특(112/JTL_7/'특별세액감면'/'중특') → flat_5 / billable → U자 / 제외 → none
 *   - 누진표 가산률: % 단위 (0.05 = 0.05%)
 *
 * 모든 함수 = pure, side-effect 0. 단위 테스트 친화적.
 */

/* ─── Types ─────────────────────────────────────────────── */
export type S3Rule = 'flat_5' | 'progressive_u' | 'none';
export type FeeRuleRow = [number, number, number]; // [수입금액 임계(원), 기본보수(원), 가산률(%)]

export interface S2Item {
  name: string;
  val: number; // 단가 (원)
  qty: number; // 건수
}
export interface S3Item {
  code?: string;
  name: string;
  amt: number; // 감면액 (원)
  rule: S3Rule;
}
export interface CatalogRaw {
  code?: unknown;
  name?: unknown;
  cat?: unknown;
  alias?: unknown;
  law?: unknown;
}
export interface CatalogItem {
  code: string;
  name: string;
  billable: boolean;
  rule: S3Rule;
  category: string;
  alias: string[];
  law: string;
}

/* ─── 기본 누진표 (Template 미저장 시 fallback) — 가산률 % 단위 (0.05 = 0.05%) ─── */
export const DEFAULT_CORP: FeeRuleRow[] = [
  [0, 300_000, 0],
  [500_000_000, 500_000, 0.05],
  [1_000_000_000, 800_000, 0.1],
];
export const DEFAULT_INDV: FeeRuleRow[] = [
  [0, 200_000, 0],
  [300_000_000, 400_000, 0.05],
];

/* ─── 기본 활증업무 (Section 2) — 양식 미저장 시 fallback. 사장님 명령 (2026-05-21):
 * "개인은 타소득합산 이런거 기본으로 깔려잇고 내가 숫자넣으면 되도록".
 * 새 청구서 발행 진입 시 자동으로 깔림 (단가 0 → 사장님이 숫자만 입력. val=0 은 청구서 미표시). */
export interface S2OptionDef {
  name: string;
  type?: 'unit' | 'rate' | 'direct';
  val?: number;
  desc?: string;
}
/* 단가 = billing-preview.js SECTIONS 사장님 원본 (2026-05-21 "단가 후려치기" 보고 후 복원).
 * direct = 사장님이 단가 직접 입력 (val 0) / unit = 건당 단가 (그대로). */
export const DEFAULT_S2_CORP: S2OptionDef[] = [
  { name: '신용카드 내역 검토', type: 'direct', val: 0, desc: '직접 입력' },
  { name: '4대보험 취득·상실', type: 'unit', val: 10_000, desc: '건당' },
  { name: '연말정산', type: 'unit', val: 20_000, desc: '인당' },
  { name: '부가세 수정신고', type: 'unit', val: 50_000, desc: '건당' },
];
export const DEFAULT_S2_INDV: S2OptionDef[] = [
  { name: '타소득 합산', type: 'direct', val: 0, desc: '타소득 합산 신고 시' },
  { name: '근로소득 합산', type: 'direct', val: 0, desc: '근로소득 합산 신고 시' },
  { name: '신용카드 내역 검토', type: 'direct', val: 0, desc: '직접 입력' },
  { name: '4대보험 (자영업자)', type: 'unit', val: 10_000, desc: '건당' },
  { name: '프리랜서 인적용역', type: 'unit', val: 30_000, desc: '건당' },
];

/* ─── 포맷 ─────────────────────────────────────────────── */
export function formatWon(n: number | null | undefined): string {
  return (n || 0).toLocaleString('ko-KR');
}

/* ─── 기본 세무조정료 (누진표) ───────────────────────────
 * 수입금액 임계 이상 → 기본보수 + (초과 × 가산률%). 1,000원 단위 절사.
 * 가산률 단위 = % (0.05 = 0.05%). 호환: 옛 데이터가 ratio(0.0005) 일 가능성 0 — 모두 % 통일. */
export function calcBase(amount: number, tariff: FeeRuleRow[]): number {
  if (!tariff || tariff.length === 0) return 0;
  let row: FeeRuleRow = tariff[0];
  for (let i = 0; i < tariff.length; i++) {
    if (amount >= tariff[i][0]) row = tariff[i];
    else break;
  }
  return Math.floor((row[1] + (amount - row[0]) * ((row[2] || 0) / 100)) / 1000) * 1000;
}

/* ─── Section 3 가산액 (감면액 × 룰) ─────────────────────
 * flat_5: 감면액 × 5% (중특) / progressive_u: U자 (500↓20% · 500~1000:10% · 1000↑20%) / none: 0 */
export function calcGain(amt: number, rule: S3Rule): number {
  if (amt <= 0) return 0;
  if (rule === 'flat_5') return Math.floor(amt * 0.05);
  if (rule === 'progressive_u') {
    let g = 0;
    if (amt <= 5_000_000) g = amt * 0.2;
    else if (amt <= 10_000_000) g = amt * 0.1;
    else g = amt * 0.2;
    return Math.floor(g);
  }
  return 0;
}

/* ─── 카탈로그 billable / rule (billing-preview.js line 987 룰) ───
 * billable = cat 이 general/special 이 아닐 때만 true (자연발생 자동 제외). */
export function catBillable(cat: string | null | undefined): boolean {
  return !(cat === 'general' || cat === 'special');
}
/** 중특(중소기업특별세액감면) = flat_5. 그 외 billable = U자, 제외 = none. */
export function catRule(item: { code?: string; name?: string; alias?: string[]; cat?: string }): S3Rule {
  const code = String(item.code || '');
  const name = String(item.name || '');
  const alias = Array.isArray(item.alias) ? item.alias : [];
  if (code === 'JTL_7' || code === '112' || name.includes('특별세액감면') || alias.includes('중특')) {
    return 'flat_5';
  }
  return catBillable(item.cat) ? 'progressive_u' : 'none';
}
/** raw catalog.json 항목 → 정규화 (billable + rule 계산 포함). */
export function normalizeCatalogItem(raw: CatalogRaw): CatalogItem {
  const code = String(raw.code || '');
  const name = String(raw.name || '');
  const category = String(raw.cat || '');
  const alias = Array.isArray(raw.alias) ? (raw.alias as string[]) : [];
  return {
    code,
    name,
    category,
    alias,
    law: String(raw.law || ''),
    billable: catBillable(category),
    rule: catRule({ code, name, alias, cat: category }),
  };
}

/* ─── 소계 ─────────────────────────────────────────────── */
export function calcS2Total(items: S2Item[]): number {
  return (items || []).reduce((a, it) => a + (it.val || 0) * (it.qty || 0), 0);
}
export function calcS3Total(items: S3Item[]): number {
  return (items || []).reduce((a, it) => a + calcGain(it.amt || 0, it.rule), 0);
}

/* ─── 청구서 합계 (기본보수 + 결산 20% + 원가 10% + S2 + S3 − 할인 + VAT) ─── */
export interface InvoiceCalcInput {
  revenue: number;
  asset: number;
  taxType: string; // '법인세' | '종소세' | '부가세'
  basicType: string; // '...장부...' 면 결산료 가산
  s2Items: S2Item[];
  s3Items: S3Item[];
  discount: number; // 원 (수기)
  tariffCorp?: FeeRuleRow[];
  tariffIndv?: FeeRuleRow[];
}
export interface InvoiceCalcResult {
  base: number;
  ket: number; // 결산료 (장부 20%)
  cst: number; // 원가 (10%)
  s2Tot: number;
  s3Tot: number;
  extra: number;
  supply: number; // 공급가 (할인 전)
  disc: number;
  supplyDisc: number; // 공급가 (할인 후)
  vat: number;
  total: number; // 최종 (VAT 포함)
  baseFee: number; // base + ket + cst (미리보기 '기본 세무조정료')
}
export function calcInvoice(input: InvoiceCalcInput): InvoiceCalcResult {
  const tariff =
    input.taxType === '법인세'
      ? input.tariffCorp || DEFAULT_CORP
      : input.tariffIndv || DEFAULT_INDV;
  const baseRev = Math.max(input.revenue || 0, input.asset || 0);
  const base = calcBase(baseRev, tariff);
  const ket = input.basicType.includes('장부') ? Math.floor((base * 0.2) / 1000) * 1000 : 0;
  const cst = base > 0 ? Math.floor(((base + ket) * 0.1) / 1000) * 1000 : 0;
  const s2Tot = calcS2Total(input.s2Items);
  const s3Tot = calcS3Total(input.s3Items);
  const extra = s2Tot + s3Tot;
  const supply = base + ket + cst + extra;
  const disc = Math.max(0, Number(input.discount) || 0);
  const supplyDisc = Math.max(0, supply - disc);
  const vat = Math.round(supplyDisc * 0.1);
  const total = supplyDisc + vat;
  return { base, ket, cst, s2Tot, s3Tot, extra, supply, disc, supplyDisc, vat, total, baseFee: base + ket + cst };
}
