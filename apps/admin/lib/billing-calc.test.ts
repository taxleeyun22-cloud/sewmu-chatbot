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

describe('calcBase — 사장님 원본 누진표 (invoice.zip, 가산률 % 단위)', () => {
  it('법인 첫 구간 (1억 미만) → 46만', () => {
    expect(calcBase(0, DEFAULT_CORP)).toBe(460_000);
    expect(calcBase(50_000_000, DEFAULT_CORP)).toBe(460_000);
  });
  it('법인 5억~10억 7억 → 132만 + (2억 × 0.1%) = 152만', () => {
    // 1_320_000 + 200_000_000 * 0.1/100 = 1_320_000 + 200_000 = 1_520_000
    expect(calcBase(700_000_000, DEFAULT_CORP)).toBe(1_520_000);
  });
  it('법인 1억~3억 2억 → 46만 + (1억 × 0.25%) = 71만', () => {
    // 460_000 + 100_000_000 * 0.25/100 = 460_000 + 250_000 = 710_000
    expect(calcBase(200_000_000, DEFAULT_CORP)).toBe(710_000);
  });
  it('개인 3억~5억 4억 → 80만 + (1억 × 0.18%) = 98만', () => {
    // 800_000 + 100_000_000 * 0.18/100 = 800_000 + 180_000 = 980_000
    expect(calcBase(400_000_000, DEFAULT_INDV)).toBe(980_000);
  });
  it('개인 첫 구간 → 30만', () => {
    expect(calcBase(0, DEFAULT_INDV)).toBe(300_000);
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
  it('개인 종소세 장부, 수입 0, 원가 X → base 30만 + 결산 6만 = 36만, VAT 포함 39.6만', () => {
    const r = calcInvoice({
      revenue: 0,
      asset: 0,
      taxType: '종소세',
      basicType: '개인장부대행 및 개인조정', // 장부 → 결산 default on, 원가 default off
      s2Items: [],
      s3Items: [],
      discount: 0,
    });
    expect(r.base).toBe(300_000);
    expect(r.ket).toBe(60_000); // 300_000 * 20% (장부 → 결산 on)
    expect(r.cst).toBe(0); // 원가 default off
    expect(r.baseFee).toBe(360_000);
    expect(r.total).toBe(396_000); // 360_000 * 1.1
  });
  it('원가 체크 시 → base × 10% 추가 (원본 invoice.zip: base 기준)', () => {
    const r = calcInvoice({
      revenue: 0,
      asset: 0,
      taxType: '종소세',
      basicType: '개인장부대행 및 개인조정',
      s2Items: [],
      s3Items: [],
      discount: 0,
      hasCost: true,
    });
    expect(r.cst).toBe(30_000); // 300_000 * 10% (base 기준, NOT (base+ket))
    expect(r.baseFee).toBe(390_000); // 300_000 + 60_000 + 30_000
  });
  it('할인액 차감 후 VAT', () => {
    const r = calcInvoice({
      revenue: 0,
      asset: 0,
      taxType: '종소세',
      basicType: '개인장부대행 및 개인조정',
      s2Items: [],
      s3Items: [],
      discount: 60_000,
    });
    // supply 360_000 - 60_000 = 300_000, vat 30_000, total 330_000
    expect(r.supplyDisc).toBe(300_000);
    expect(r.total).toBe(330_000);
  });
  it('조정 only (장부 X) → 결산료 0', () => {
    const r = calcInvoice({
      revenue: 0,
      asset: 0,
      taxType: '법인세',
      basicType: '법인조정', // 장부 아님 → 결산 off
      s2Items: [],
      s3Items: [],
      discount: 0,
    });
    expect(r.ket).toBe(0);
    expect(r.cst).toBe(0);
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
