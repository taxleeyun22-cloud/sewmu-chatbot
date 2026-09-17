/**
 * 신고서 PDF 파서 — 별지 제40호서식 레이아웃 기준.
 *
 * ⚠ 실제 거래처 신고서를 fixture 로 커밋하지 않는다. 주민번호·매출이 그대로
 *   git 에 남는다. 아래는 같은 레이아웃의 가상 신고서다 (숫자는 검산이
 *   맞아떨어지도록 구성).
 *
 * 여기서 지키는 것:
 *  1. 항목번호 앵커로 11개 필드를 읽는다
 *  2. 사업장이 여러 개면 총수입금액을 합산한다
 *  3. 공제 항목은 세액공제명세서 구간에서만 찾는다 (손익계산서 오인 방지)
 *  4. 검산이 틀리면 ok=false — 틀린 세금 숫자가 조용히 들어가지 않는다
 *  5. 주민번호 뒤 7자리는 읽지도 반환하지도 않는다
 */
import { describe, it, expect } from 'vitest';
import { parseFilingText, rrnToBirthDate } from './filing-pdf-parse';

/* 가상 신고서 — 실제 서식의 줄 모양을 그대로 흉내냈다.
   종합소득금액 100,000,000 / 소득공제 5,000,000 → 과세표준 95,000,000
   산출세액 20,000,000 − 공제 7,000,000 → 결정세액 13,000,000
   기납부 3,000,000 → 납부할세액 10,000,000 */
const SAMPLE = `
                                 (2025년귀속)종합소득세ㆍ농어촌특별세
                                   과세표준확정신고 및 납부계산서

❶ 기본사항
①성      명                 홍길동                                  ② 주민등록번호                   900101-1987654

③주      소                 대구광역시 달서구 테스트로 1

❹ 세액의 계산
            구                   분                        종합소득세                         농어촌특별세
종       합        소         득
                           액         금                      19                               100,000,000
소      득       공           제                                20                                 5,000,000
과   세    표   준 ( 19 － 20 )                                  21                                95,000,000
세                          율                                22                                         35.0
산      출       세           액                                23                                20,000,000
세      액       감           면                                24                                         0
세      액       공           제                                25                                 7,000,000
      합          계( 26 + 27 )                               28                                13,000,000
가          산               세                                29                                         0
기       납             부         세                      액    32                                 3,000,000
납 부(환급) 할 총 세 액(                         31   －    32   )   33                                10,000,000
신고기한 이내 납부할 세액( 33 － 34 + 35 － 36 )                         37                                10,000,000      53                             1,200,000

❼ 사업소득명세서
④상                 호                  테스트상사
⑤사업자등록번호                              123-45-67890          000-00-00000
⑨총 수 입 금 액                                   400,000,000            50,000,000
⑩필         요   경        비                    340,000,000            10,000,000

⑬ 세액공제명세서
              세액공제항목                                   ② 코드   공제대상금액        적용률        ③세액공제
                              퇴       직       연   금     275      3,000,000                360,000
                              연 금 저 축                   276      5,333,333 (15%)          640,000
전 자 신 고 에 대 한 세 액 공 제             244           2,000,000      2,000,000
성 실 신 고 확 인 비 용 세 액 공 제           267           4,000,000      4,000,000   123-45-67890
                  표       준   세       액   공       제     284                               0
⑭ 준비금명세서
        ①                        준비금 손금산입액
`;

describe('parseFilingText — 정상 신고서', () => {
  const r = parseFilingText(SAMPLE);

  it('귀속연도를 읽는다', () => {
    expect(r.fiscal_year).toBe(2025);
  });

  it('세액 계산 항목 전부 읽는다', () => {
    expect(r.fields.total_income).toBe(100_000_000);
    expect(r.fields.income_deduction).toBe(5_000_000);
    expect(r.fields.tax_base).toBe(95_000_000);
    expect(r.fields.calculated_tax).toBe(20_000_000);
    expect(r.fields.deduction_total).toBe(7_000_000);
    expect(r.fields.penalty_total).toBe(0);
    expect(r.fields.decisive_tax).toBe(13_000_000);
    expect(r.fields.prepaid_tax).toBe(3_000_000);
    expect(r.fields.payable_tax).toBe(10_000_000);
  });

  it('농어촌특별세를 읽는다', () => {
    expect(r.fields.farmland_tax).toBe(1_200_000);
  });

  it('사업장이 2개면 총수입금액을 합산한다', () => {
    expect(r.fields.revenue).toBe(450_000_000);
  });

  it('공제 항목을 코드·이름·금액으로 읽는다', () => {
    const d = r.fields.공제감면 ?? [];
    expect(d.map((x) => x.code)).toEqual(['275', '276', '244', '267']);
    expect(d.find((x) => x.code === '244')?.amount).toBe(2_000_000);
  });

  it('금액 0 인 항목(표준세액공제)은 버린다 — 합계가 어긋나지 않게', () => {
    expect((r.fields.공제감면 ?? []).some((d) => d.code === '284')).toBe(false);
  });

  it('공제 내역 합이 세액공제·감면 합계와 맞는다', () => {
    const sum = (r.fields.공제감면 ?? []).reduce((s, d) => s + d.amount, 0);
    expect(sum).toBe(r.fields.deduction_total);
  });

  it('검산 4개가 전부 통과한다', () => {
    expect(r.checks.length).toBe(4);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it('ok = true, problems 없음', () => {
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
  });
});

describe('거래처 매칭 정보', () => {
  const r = parseFilingText(SAMPLE);

  it('성명을 읽는다', () => {
    expect(r.owner.name).toBe('홍길동');
  });

  it('사업자등록번호를 하이픈 없이 읽는다', () => {
    expect(r.owner.biz_no).toBe('1234567890');
  });

  it('000-00-00000(사업자등록 없는 인적용역)은 건너뛴다', () => {
    const only = parseFilingText('⑤사업자등록번호   000-00-00000   987-65-43210');
    expect(only.owner.biz_no).toBe('9876543210');
  });

  it('상호를 읽는다', () => {
    expect(r.owner.company_name).toBe('테스트상사');
  });
});

describe('주민등록번호 — 뒤 7자리는 절대 남기지 않는다', () => {
  const r = parseFilingText(SAMPLE);

  it('생년월일만 남는다', () => {
    expect(r.owner.birth_date).toBe('1990-01-01');
  });

  it('반환값 어디에도 뒤 7자리가 없다', () => {
    const dump = JSON.stringify(r);
    expect(dump).not.toContain('1987654');   /* 뒤 7자리 */
    expect(dump).not.toContain('900101');    /* 앞 6자리 원형 */
  });

  it('세기 판정 — 1·2 는 19xx, 3·4 는 20xx', () => {
    expect(rrnToBirthDate('900101', '1')).toBe('1990-01-01');
    expect(rrnToBirthDate('900101', '2')).toBe('1990-01-01');
    expect(rrnToBirthDate('050301', '3')).toBe('2005-03-01');
    expect(rrnToBirthDate('050301', '4')).toBe('2005-03-01');
  });

  it('말이 안 되는 날짜·자릿수는 버린다', () => {
    expect(rrnToBirthDate('901301', '1')).toBeNull();   // 13월
    expect(rrnToBirthDate('900132', '1')).toBeNull();   // 32일
    expect(rrnToBirthDate('9001', '1')).toBeNull();
    expect(rrnToBirthDate('900101', '7')).toBeNull();
  });
});

describe('검산 — 틀리면 심지 않는다', () => {
  it('과세표준이 안 맞으면 ok=false 이고 사유가 남는다', () => {
    const bad = SAMPLE.replace('21                                95,000,000', '21                                99,999,999');
    const r = parseFilingText(bad);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('과세표준 = 종합소득금액 − 종합소득공제');
    expect(r.checks.find((c) => c.label.startsWith('과세표준'))?.diff).toBe(4_999_999);
  });

  it('결정세액이 안 맞으면 잡아낸다', () => {
    const bad = SAMPLE.replace('28                                13,000,000', '28                                12,000,000');
    expect(parseFilingText(bad).ok).toBe(false);
  });

  it('공제 내역 합이 합계와 다르면 잡아낸다', () => {
    const bad = SAMPLE.replace('244           2,000,000      2,000,000', '244           2,000,000      1,000,000');
    const r = parseFilingText(bad);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('공제 내역 합');
  });

  it('필수 항목을 못 읽으면 사유가 남는다', () => {
    const r = parseFilingText('아무 내용 없음');
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('수입금액');
    expect(r.problems.join(' ')).toContain('귀속연도');
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(() => parseFilingText('')).not.toThrow();
    expect(parseFilingText('').ok).toBe(false);
  });
});

describe('공제 항목 오인 방지', () => {
  it('세액공제명세서 밖의 손익계산서 숫자를 공제로 줍지 않는다', () => {
    const withPnl = SAMPLE + `
표준손익계산서
                14소모품비                        190      178,241,611      16,022
                12지급수수료                      365       65,234,000      27,736
`;
    const r = parseFilingText(withPnl);
    const codes = (r.fields.공제감면 ?? []).map((d) => d.code);
    expect(codes).not.toContain('190');
    expect(codes).not.toContain('365');
    expect(r.ok).toBe(true);
  });

  it('세액공제명세서가 없으면 공제 목록이 빈다', () => {
    const noSec = SAMPLE.replace('⑬ 세액공제명세서', '⑬ 다른표');
    expect(parseFilingText(noSec).fields.공제감면).toEqual([]);
  });
});
