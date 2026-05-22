/**
 * billing-calc SSoT 단위 테스트 (2026-05-21).
 *
 * 사장님 명령: "안전하게 구글처럼" — 청구서 계산·룰 단일 진실 모듈의 회귀 방지.
 */
import { describe, it, expect } from 'vitest';
import {
  calcBase,
  calcGain,
  catBillable,
  catRule,
  normalizeCatalogItem,
  calcS2Total,
  calcS3Total,
  calcInvoice,
  formatWon,
  DEFAULT_CORP,
  DEFAULT_INDV,
} from './billing-calc';

describe('calcBase — 누진표 기본보수 (가산률 % 단위)', () => {
  it('첫 구간 (임계 미만) → 기본보수', () => {
    expect(calcBase(0, DEFAULT_CORP)).toBe(300_000);
    expect(calcBase(100_000_000, DEFAULT_CORP)).toBe(300_000);
  });
  it('5억~10억 7억 → 50만 + (2억 × 0.05%) = 60만', () => {
    // 500_000 + 200_000_000 * 0.05/100 = 500_000 + 100_000 = 600_000
    expect(calcBase(700_000_000, DEFAULT_CORP)).toBe(600_000);
  });
  it('10억↑ 15억 → 80만 + (5억 × 0.1%) = 130만', () => {
    // 800_000 + 500_000_000 * 0.1/100 = 800_000 + 500_000 = 1_300_000
    expect(calcBase(1_500_000_000, DEFAULT_CORP)).toBe(1_300_000);
  });
  it('개인 3억↑ 4억 → 40만 + (1억 × 0.05%) = 45만', () => {
    expect(calcBase(400_000_000, DEFAULT_INDV)).toBe(450_000);
  });
  it('빈 tariff → 0', () => {
    expect(calcBase(1_000_000, [])).toBe(0);
  });
});

describe('calcGain — Section 3 가산 (flat_5 / U자)', () => {
  it('flat_5 = 5%', () => {
    expect(calcGain(10_000_000, 'flat_5')).toBe(500_000);
  });
  it('U자 500↓ = 20%', () => {
    expect(calcGain(4_000_000, 'progressive_u')).toBe(800_000);
  });
  it('U자 500~1000 = 10%', () => {
    expect(calcGain(8_000_000, 'progressive_u')).toBe(800_000);
  });
  it('U자 1000↑ = 20%', () => {
    expect(calcGain(20_000_000, 'progressive_u')).toBe(4_000_000);
  });
  it('none = 0', () => {
    expect(calcGain(10_000_000, 'none')).toBe(0);
  });
  it('0 이하 → 0', () => {
    expect(calcGain(0, 'flat_5')).toBe(0);
    expect(calcGain(-100, 'progressive_u')).toBe(0);
  });
});

describe('catBillable — 자연발생 자동 제외 (사장님 룰)', () => {
  it('general (배당·기장·근로·자녀·연금) → false', () => {
    expect(catBillable('general')).toBe(false);
  });
  it('special (보험·의료비·교육비·기부금·표준) → false', () => {
    expect(catBillable('special')).toBe(false);
  });
  it('credit_invest / credit_rnd / credit_employee / exemption → true', () => {
    expect(catBillable('credit_invest')).toBe(true);
    expect(catBillable('credit_rnd')).toBe(true);
    expect(catBillable('credit_employee')).toBe(true);
    expect(catBillable('exemption')).toBe(true);
  });
  it('null/undefined → true (보수적 X — 미분류는 가산 대상)', () => {
    expect(catBillable(null)).toBe(true);
    expect(catBillable(undefined)).toBe(true);
  });
});

describe('catRule — 중특 flat_5 / billable U자 / 제외 none', () => {
  it('중특 code 112 → flat_5', () => {
    expect(catRule({ code: '112', cat: 'exemption' })).toBe('flat_5');
  });
  it('중특 code JTL_7 → flat_5', () => {
    expect(catRule({ code: 'JTL_7', cat: 'exemption' })).toBe('flat_5');
  });
  it('이름에 특별세액감면 → flat_5', () => {
    expect(catRule({ code: 'X', name: '중소기업특별세액감면', cat: 'exemption' })).toBe('flat_5');
  });
  it('별칭 중특 → flat_5', () => {
    expect(catRule({ code: 'X', alias: ['중특'], cat: 'exemption' })).toBe('flat_5');
  });
  it('일반 billable (credit_rnd) → U자', () => {
    expect(catRule({ code: '13L', cat: 'credit_rnd' })).toBe('progressive_u');
  });
  it('general/special (자연발생) → none', () => {
    expect(catRule({ code: 'JTL_56_2', name: '기장세액공제', cat: 'general' })).toBe('none');
    expect(catRule({ code: 'SOD_59_4_F', name: '표준세액공제', cat: 'special' })).toBe('none');
  });
});

describe('normalizeCatalogItem — raw → 정규화', () => {
  it('기장세액공제 (general) → billable false, rule none', () => {
    const n = normalizeCatalogItem({ code: 'JTL_56_2', name: '기장세액공제', cat: 'general', alias: ['기장'] });
    expect(n.billable).toBe(false);
    expect(n.rule).toBe('none');
    expect(n.category).toBe('general');
  });
  it('중소기업투자세액공제 (credit_invest) → billable true, rule U자', () => {
    const n = normalizeCatalogItem({ code: '131', name: '중소기업투자세액공제', cat: 'credit_invest' });
    expect(n.billable).toBe(true);
    expect(n.rule).toBe('progressive_u');
  });
});

describe('calcS2Total / calcS3Total', () => {
  it('S2 = Σ(단가 × 건수)', () => {
    expect(calcS2Total([{ name: 'a', val: 10_000, qty: 3 }, { name: 'b', val: 5_000, qty: 2 }])).toBe(40_000);
  });
  it('S2 단가 0 → 합계 기여 0', () => {
    expect(calcS2Total([{ name: 'a', val: 0, qty: 1 }, { name: 'b', val: 5_000, qty: 2 }])).toBe(10_000);
  });
  it('S3 = Σ calcGain', () => {
    // 중특 1000만 flat_5 = 50만 + U자 400만 = 80만 → 130만
    expect(
      calcS3Total([
        { name: '중특', amt: 10_000_000, rule: 'flat_5' },
        { name: 'R&D', amt: 4_000_000, rule: 'progressive_u' },
      ]),
    ).toBe(1_300_000);
  });
});

describe('calcInvoice — 청구서 합계 (장부 결산 20% + 원가 10% + VAT)', () => {
  it('개인 종소세 장부, 수입 0 → base 20만 + 결산 4만 + 원가 2.4만 = 26.4만, VAT 포함 29.04만', () => {
    const r = calcInvoice({
      revenue: 0,
      asset: 0,
      taxType: '종소세',
      basicType: '개인장부대행 및 개인조정',
      s2Items: [],
      s3Items: [],
      discount: 0,
    });
    expect(r.base).toBe(200_000);
    expect(r.ket).toBe(40_000);
    expect(r.cst).toBe(24_000);
    expect(r.baseFee).toBe(264_000);
    expect(r.total).toBe(290_400);
  });
  it('할인액 차감 후 VAT', () => {
    const r = calcInvoice({
      revenue: 0,
      asset: 0,
      taxType: '종소세',
      basicType: '개인장부대행 및 개인조정',
      s2Items: [],
      s3Items: [],
      discount: 64_000,
    });
    // supply 264_000 - 64_000 = 200_000, vat 20_000, total 220_000
    expect(r.supplyDisc).toBe(200_000);
    expect(r.total).toBe(220_000);
  });
  it('조정 only (장부 X) → 결산료 0', () => {
    const r = calcInvoice({
      revenue: 0,
      asset: 0,
      taxType: '법인세',
      basicType: '법인조정',
      s2Items: [],
      s3Items: [],
      discount: 0,
    });
    expect(r.ket).toBe(0);
  });
});

describe('formatWon', () => {
  it('천 단위 콤마', () => {
    expect(formatWon(1234567)).toBe('1,234,567');
  });
  it('null/undefined → 0', () => {
    expect(formatWon(null)).toBe('0');
    expect(formatWon(undefined)).toBe('0');
  });
});
