/**
 * billing-calc 단위 테스트.
 *
 * 사장님 명령 (2026-05-20): "구글 개발자처럼 — 단위 테스트 확실히".
 * pure functions 라 mock 0 / fast (< 50ms).
 */
import { describe, it, expect } from 'vitest';
import {
  calcBase,
  calcGain,
  calcS2Total,
  calcS3Total,
  calcInvoiceTotal,
  statusOf,
  catLabel,
  formatWon,
} from './billing-calc';
import type { FeeRuleRow, S2Item, S3Item } from '@sewmu/types';

describe('calcBase — 누진표 기본보수', () => {
  const corpTariff: FeeRuleRow[] = [
    [0, 300_000, 0],
    [500_000_000, 500_000, 0.05],
    [1_000_000_000, 800_000, 0.1],
  ];

  it('첫 구간 — 임계 미만 일정', () => {
    expect(calcBase(100_000_000, corpTariff)).toBe(300_000);
    expect(calcBase(0, corpTariff)).toBe(300_000);
  });

  it('두번째 구간 — 5억 초과 시 가산률 적용', () => {
    // 7억: 500,000 + (700M - 500M)*0.05% = 500,000 + 100,000 = 600,000
    expect(calcBase(700_000_000, corpTariff)).toBe(600_000);
  });

  it('세번째 구간 — 10억 초과', () => {
    // 15억: 800,000 + (1.5B - 1B)*0.1% = 800,000 + 500,000 = 1,300,000
    expect(calcBase(1_500_000_000, corpTariff)).toBe(1_300_000);
  });

  it('1000원 단위 절사', () => {
    // 가산 결과가 1234.5 같으면 1000 으로 절사
    const rule: FeeRuleRow[] = [[0, 333_333, 0]];
    expect(calcBase(0, rule)).toBe(333_000);
  });

  it('빈 누진표 → 0', () => {
    expect(calcBase(1_000_000, [])).toBe(0);
  });
});

describe('calcGain — S3 가산액', () => {
  it('flat_5: 감면액 × 5%', () => {
    expect(calcGain(10_000_000, 'flat_5')).toBe(500_000);
    expect(calcGain(1_000_000, 'flat_5')).toBe(50_000);
  });

  it('progressive_u (U자) — 500만 이하 20%', () => {
    expect(calcGain(3_000_000, 'progressive_u')).toBe(600_000); // 3M × 20%
    expect(calcGain(5_000_000, 'progressive_u')).toBe(1_000_000); // 5M × 20%
  });

  it('progressive_u — 500~1000만 10%', () => {
    expect(calcGain(7_000_000, 'progressive_u')).toBe(700_000); // 7M × 10%
    expect(calcGain(10_000_000, 'progressive_u')).toBe(1_000_000); // 10M × 10%
  });

  it('progressive_u — 1000만 초과 20%', () => {
    expect(calcGain(15_000_000, 'progressive_u')).toBe(3_000_000); // 15M × 20%
    expect(calcGain(50_000_000, 'progressive_u')).toBe(10_000_000); // 50M × 20%
  });

  it('none 또는 0 → 0', () => {
    expect(calcGain(10_000_000, 'none')).toBe(0);
    expect(calcGain(0, 'flat_5')).toBe(0);
    expect(calcGain(-100, 'progressive_u')).toBe(0);
  });
});

describe('calcS2Total — Section 2 합계', () => {
  it('단가 × 건수 합산', () => {
    const items: S2Item[] = [
      { name: '4대보험', val: 10_000, qty: 5 }, // 50,000
      { name: '연말정산', val: 20_000, qty: 3 }, // 60,000
      { name: '신용카드 검토', val: 100_000, qty: 1 }, // 100,000
    ];
    expect(calcS2Total(items)).toBe(210_000);
  });

  it('qty 0 또는 default 1', () => {
    expect(calcS2Total([{ name: 'X', val: 50_000, qty: 1 }])).toBe(50_000);
    expect(calcS2Total([])).toBe(0);
  });
});

describe('calcS3Total — Section 3 합계', () => {
  it('gain 명시 시 그 값 사용', () => {
    const items: S3Item[] = [
      { code: '112', name: '중특', amt: 10_000_000, rule: 'flat_5', gain: 500_000 },
      { code: '18F', name: '고용증대', amt: 5_000_000, rule: 'progressive_u', gain: 1_000_000 },
    ];
    expect(calcS3Total(items)).toBe(1_500_000);
  });

  it('gain 미지정 시 amt+rule 로 재계산', () => {
    const items: S3Item[] = [{ code: '112', name: '중특', amt: 10_000_000, rule: 'flat_5' }];
    expect(calcS3Total(items)).toBe(500_000);
  });
});

describe('calcInvoiceTotal — 최종 청구', () => {
  it('VAT 10% + 할인 적용', () => {
    const result = calcInvoiceTotal(500_000, 100_000, 60_000, 0, 200_000, 500_000, 100_000);
    // supply = 500 + 100 + 60 + 200 + 500 = 1,360,000
    // supplyDisc = 1,360,000 - 100,000 = 1,260,000
    // vat = 126,000
    // total = 1,386,000
    expect(result.supply).toBe(1_360_000);
    expect(result.supplyDisc).toBe(1_260_000);
    expect(result.vat).toBe(126_000);
    expect(result.total).toBe(1_386_000);
  });

  it('할인 = supply 보다 크면 0 으로 clamp', () => {
    const result = calcInvoiceTotal(100_000, 0, 0, 0, 0, 0, 1_000_000);
    expect(result.supplyDisc).toBe(0);
    expect(result.vat).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe('statusOf — 청구서 상태', () => {
  it('sent=false → 발행X', () => {
    expect(statusOf({ sent: false }).code).toBe('gr');
  });

  it('paid=true → 수금', () => {
    expect(statusOf({ sent: true, paid: true }).code).toBe('g');
  });

  it('due 지났는데 안 받음 → 미수 + 일수', () => {
    const result = statusOf({ sent: true, paid: false, due: '2025-01-01' }, '2025-01-11');
    expect(result.code).toBe('r');
    expect(result.label).toContain('10일');
  });

  it('due 미래 → 발송', () => {
    expect(statusOf({ sent: true, paid: false, due: '2030-01-01' }, '2025-05-20').code).toBe('y');
  });
});

describe('catLabel — 카탈로그 카테고리 라벨', () => {
  it('알려진 코드', () => {
    expect(catLabel('credit_invest')).toBe('투자');
    expect(catLabel('exemption')).toBe('감면');
    expect(catLabel('credit_rnd')).toBe('R&D');
  });

  it('알 수 없는 코드 → 원본 그대로', () => {
    expect(catLabel('unknown_xyz')).toBe('unknown_xyz');
  });
});

describe('formatWon — 한국식 콤마', () => {
  it('일반', () => {
    expect(formatWon(1_234_567)).toBe('1,234,567');
    expect(formatWon(1_000_000)).toBe('1,000,000');
  });

  it('null/undefined → 0', () => {
    expect(formatWon(null)).toBe('0');
    expect(formatWon(undefined)).toBe('0');
    expect(formatWon(0)).toBe('0');
  });
});
