/**
 * Phase X (2026-05-20): src/lib/billing-calc — 청구서 계산 helper (pure functions).
 *
 * 사장님 명령: "구글 개발자처럼 — DRY + 단위 테스트".
 *
 * 사용처:
 *   - billing-preview.html (옛 인프라, classic script)
 *   - apps/admin/app/admin/billing (새 인프라, Next.js — 향후 본적용)
 *
 * 모든 함수 = pure, side-effect 0. 단위 테스트 친화적.
 */
import type { FeeRuleRow, S2Item, S3Item, S3Rule, InvoiceStatus } from '@sewmu/types';

/**
 * 기본 세무조정료 계산 — 누진표 + 가산률.
 *
 * 누진표 예시 (법인):
 *   [0, 300000, 0]            ← 0~5억: 30만원
 *   [500000000, 500000, 0.05] ← 5억~10억: 50만원 + 초과×0.05%
 *   [1000000000, 800000, 0.1] ← 10억~: 80만원 + 초과×0.1%
 *
 * @param amount 산출기준 (수입금액 또는 자산총액 중 큰 것)
 * @param tariff 누진표 [[임계, 기본보수, 가산률%], ...]
 * @returns 1,000원 단위 절사 기본보수
 */
export function calcBase(amount: number, tariff: FeeRuleRow[]): number {
  if (!tariff || tariff.length === 0) return 0;
  let row: FeeRuleRow = tariff[0];
  for (let i = 0; i < tariff.length; i++) {
    if (amount >= tariff[i][0]) row = tariff[i];
    else break;
  }
  const [threshold, baseFee, ratePct] = row;
  return Math.floor((baseFee + (amount - threshold) * ((ratePct || 0) / 100)) / 1000) * 1000;
}

/**
 * Section 3 가산액 계산 — 감면액 × 룰.
 *
 * 룰 (사장님 결정):
 *   - flat_5: 감면액 × 5% (예: 중특 — 중소기업특별세액감면)
 *   - progressive_u: U자 (500만 ↓ 20% / 500~1000만 10% / 1000만 ↑ 20%)
 *   - none: 0
 *
 * @param amt 감면액 (원)
 * @param rule 가산 룰
 * @returns 가산액 (원, 정수 절사)
 */
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

/** Section 2 합계 (단가 × 건수). */
export function calcS2Total(items: S2Item[]): number {
  return (items || []).reduce((a, it) => a + (it.val || 0) * (it.qty || 1), 0);
}

/** Section 3 합계 (각 항목 gain 합산, gain 없으면 amt+rule 로 재계산). */
export function calcS3Total(items: S3Item[]): number {
  return (items || []).reduce((a, it) => {
    const gain = it.gain !== undefined ? it.gain : calcGain(it.amt, it.rule);
    return a + gain;
  }, 0);
}

/**
 * 최종 청구 금액 계산 (VAT 포함).
 *
 * @param base 기본 세무조정료
 * @param ket 기장료 가산 (장부대행 시 base×20%)
 * @param cst 부가세 신고료 가산 ((base+ket)×10%)
 * @param s1Extra Section 1 자동 (rate% 합산)
 * @param s2Total Section 2 (직접 추가)
 * @param s3Total Section 3 (감면 가산)
 * @param discount 할인액 (사장님 수기 입력)
 * @returns {supply, supplyDisc, vat, total}
 */
export function calcInvoiceTotal(
  base: number,
  ket: number,
  cst: number,
  s1Extra: number,
  s2Total: number,
  s3Total: number,
  discount: number
): { supply: number; supplyDisc: number; vat: number; total: number } {
  const supply = base + ket + cst + s1Extra + s2Total + s3Total;
  const supplyDisc = Math.max(0, supply - (discount || 0));
  const vat = Math.round(supplyDisc * 0.1);
  const total = supplyDisc + vat;
  return { supply, supplyDisc, vat, total };
}

/**
 * 청구서 상태 결정 — 미수/발송/수금/발행X.
 *
 * @param invoice 청구서 ({sent, paid, due})
 * @param today 기준일 (ISO 'YYYY-MM-DD' 또는 Date)
 * @returns {cls, label, code}
 */
export function statusOf(
  invoice: { sent?: boolean; paid?: boolean; due?: string },
  today: Date | string = new Date()
): { cls: string; label: string; code: InvoiceStatus | 'gr' | 'r' | 'y' | 'g' } {
  const todayDate = typeof today === 'string' ? new Date(today) : today;
  if (!invoice.sent) return { cls: 'st-gr', label: '발행X', code: 'gr' };
  if (invoice.paid) return { cls: 'st-g', label: '🟢 수금', code: 'g' };
  if (invoice.due) {
    const due = new Date(invoice.due);
    if (due < todayDate) {
      const days = Math.floor((todayDate.getTime() - due.getTime()) / 86400000);
      return { cls: 'st-r', label: '🔴 미수(' + days + '일)', code: 'r' };
    }
  }
  return { cls: 'st-y', label: '🟡 발송', code: 'y' };
}

/** 카탈로그 카테고리 코드 → 한국어 라벨. */
export function catLabel(cat: string): string {
  const map: Record<string, string> = {
    general: '일반',
    special: '특별공제',
    credit_invest: '투자',
    credit_rnd: 'R&D',
    credit_employee: '고용',
    credit_general: '일반세액',
    exemption: '감면',
  };
  return map[cat] || cat;
}

/** 원 단위 한국식 콤마 포맷 ("1,234,567"). */
export function formatWon(n: number | null | undefined): string {
  return (n || 0).toLocaleString('ko-KR');
}
