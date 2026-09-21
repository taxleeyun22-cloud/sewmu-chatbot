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
⑪ 소 득 금 액(⑨ - ⑩)                              60,000,000            40,000,000

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

  it('검산 7개가 전부 통과한다', () => {
    /* 2026-09-21 사업장별 수입금액 합 검산이 늘어 6 → 7 */
    expect(r.checks.length).toBe(7);
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
    const only = parseFilingText(
      '(2025년귀속)종합소득세ㆍ농어촌특별세\n❼ 사업소득명세서\n⑤사업자등록번호   000-00-00000   987-65-43210',
    );
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
    /* 서식은 맞는데 ❹세액의계산이 통째로 안 읽힌 경우 */
    const 머리만 = SAMPLE.slice(0, SAMPLE.indexOf('❹ 세액의 계산'));
    const r = parseFilingText(머리만);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('수입금액');
  });

  it('종합소득세 신고서가 아니면 읽기 전에 끊는다', () => {
    const r = parseFilingText('아무 내용 없음');
    expect(r.ok).toBe(false);
    expect(r.unsupported).toBeTruthy();
    expect(r.fields).toEqual({});
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

describe('사업자등록번호 — 세무대리인 번호를 거래처 번호로 오인하지 않는다', () => {
  /* 실제 신고서 1면 ❸ 세무대리인 칸이 ❼ 사업소득명세서보다 먼저 나온다.
     문서 순서대로 훑으면 세무사 본인 번호를 거래처 번호로 잡는다 (실측으로 잡힌 버그). */
  const WITH_AGENT = `
❸ 세 무 ⑬성 명 이도겸    ⑭ 사업자등록번호     401-12-95381    ⑮ 전화번호 02-6958-5515
` + SAMPLE;

  it('세무대리인 번호가 앞에 있어도 거래처 번호를 잡는다', () => {
    expect(parseFilingText(WITH_AGENT).owner.biz_no).toBe('1234567890');
  });

  it('사업소득명세서 구간이 없으면 번호를 비워둔다 (엉뚱한 매칭보다 안전)', () => {
    const noSec = '❸ 세 무 ⑭ 사업자등록번호  401-12-95381';
    expect(parseFilingText(noSec).owner.biz_no).toBeUndefined();
  });
});

describe('⑨신고유형 — 50건 결과를 유형별로 묶기 위해 읽는다', () => {
  const withType = (code: string) =>
    parseFilingText(SAMPLE.replace('❹ 세액의 계산', `⑨신고유형                      ${code}\n❹ 세액의 계산`));

  it('성실신고확인(14)', () => {
    const r = withType('14');
    expect(r.filing_type_code).toBe('14');
    expect(r.filing_type_label).toBe('성실신고확인');
  });

  it('간편장부(20) · 추계-기준율(31) · 추계-단순율(32)', () => {
    expect(withType('20').filing_type_label).toBe('간편장부');
    expect(withType('31').filing_type_label).toBe('추계-기준율');
    expect(withType('32').filing_type_label).toBe('추계-단순율');
  });

  it('모르는 코드면 라벨만 비고 코드는 남긴다', () => {
    const r = withType('99');
    expect(r.filing_type_code).toBe('99');
    expect(r.filing_type_label).toBeUndefined();
  });

  it('신고유형 줄이 없어도 파싱은 계속된다', () => {
    const r = parseFilingText(SAMPLE);
    expect(r.filing_type_code).toBeUndefined();
    expect(r.ok).toBe(true);
  });
});

describe('라벨 매칭 — 제목줄 오인 방지', () => {
  it('"과세표준확정신고및납부계산서" 제목의 연도를 과세표준으로 읽지 않는다', () => {
    /* 항목번호가 없는 출력물(위하고)에서 라벨로 찾을 때 실제로 터졌던 버그 */
    const noItemNo = `
 세액의 계산
                         과세표준확정신고및납부계산서   ( 2025 년귀속)
종   합   소    득   금   액                   100,000,000
소      득      공      제                     5,000,000
과 세 표 준 (        -   )                    95,000,000
산      출      세      액                    20,000,000
`;
    const r = parseFilingText(noItemNo);
    expect(r.fields.tax_base).toBe(95_000_000);
    expect(r.fields.total_income).toBe(100_000_000);
    expect(r.fields.calculated_tax).toBe(20_000_000);
  });
});

describe('검산을 못 돌린 것은 통과가 아니다', () => {
  /* 사장님: "기납부세액은 원래 내가 저기 입력 안 한 거고 원래 있어야 하는 게 맞음"
     → 값이 비면 검산이 조용히 건너뛰어져 틀린 납부할세액이 통과할 뻔했다. */
  const 기납부_공란 = SAMPLE
    .replace('기       납             부         세                      액    32                                 3,000,000', '기       납             부         세                      액    32')
    .replace('33                                10,000,000', '33                                13,000,000');

  it('기납부세액이 비면 납부할세액 검산을 건너뛰고, 그것을 problems 에 남긴다', () => {
    const r = parseFilingText(기납부_공란);
    expect(r.fields.prepaid_tax).toBeUndefined();
    expect(r.skipped_checks).toContain('납부할세액 = 결정세액 + 가산세 + 추가납부 − 기납부세액');
    expect(r.problems.join(' ')).toContain('검산 못 함 (값 누락)');
  });

  it('건너뛴 검산이 있으면 ok=false — 미검증 숫자를 심지 않는다', () => {
    expect(parseFilingText(기납부_공란).ok).toBe(false);
  });

  it('정상 신고서는 건너뛴 검산이 없다', () => {
    const r = parseFilingText(SAMPLE);
    expect(r.skipped_checks).toEqual([]);
    expect(r.ok).toBe(true);
  });
});


describe('검산식 — 가산세·세액감면이 있는 정상 신고서가 반려되면 안 된다', () => {
  /* 코드리뷰가 실측으로 잡은 결함 2건.
     서식: 33 = (28 + 29 + 30) − 32  /  내역 목록은 ⑬세액공제명세서 구간만 긁는다 */
  const 가산세_있음 = SAMPLE
    .replace('29                                         0', '29                                   500,000')
    .replace('33                                10,000,000', '33                                10,500,000')
    .replace('37                                10,000,000', '37                                10,500,000');

  it('가산세 50만원이 붙어도 납부할세액 검산이 통과한다', () => {
    const r = parseFilingText(가산세_있음);
    expect(r.fields.penalty_total).toBe(500_000);
    expect(r.checks.find((c) => c.label.startsWith('납부할세액'))?.ok).toBe(true);
    expect(r.ok).toBe(true);
  });

  const 감면_있음 = SAMPLE
    .replace('24                                         0', '24                                 1,000,000')
    .replace('28                                13,000,000', '28                                12,000,000')
    .replace('33                                10,000,000', '33                                 9,000,000')
    .replace('37                                10,000,000', '37                                 9,000,000');

  it('세액감면 100만원이 있어도 공제 내역 합 검산이 통과한다', () => {
    const r = parseFilingText(감면_있음);
    expect(r.fields.deduction_total).toBe(8_000_000);   /* 감면 100만 + 공제 700만 */
    const c = r.checks.find((x) => x.label.startsWith('공제 내역 합'));
    expect(c?.ok).toBe(true);                            /* 내역 합 700만 = 공제(25) */
    expect(r.ok).toBe(true);
  });
});

describe('총수입금액 — 계 칸 오인 방지', () => {
  it('매출이 같은 사업장 2곳이면 합산한다 (계 칸으로 오인 금지)', () => {
    const 동일매출 = SAMPLE.replace(
      '⑨총 수 입 금 액                                   400,000,000            50,000,000',
      '⑨총 수 입 금 액                                   200,000,000           200,000,000',
    );
    expect(parseFilingText(동일매출).fields.revenue).toBe(400_000_000);
  });

  it('"계" 열이 실제로 있으면 계 값을 쓴다', () => {
    const 계있음 = SAMPLE.replace(
      '⑨총 수 입 금 액                                   400,000,000            50,000,000',
      '②일련번호        1          2          계\n⑨총 수 입 금 액        200,000,000    200,000,000    400,000,000',
    );
    expect(parseFilingText(계있음).fields.revenue).toBe(400_000_000);
  });
});

describe('구형 브라우저 — lookbehind 정규식 금지', () => {
  it('소스에 lookbehind 가 없다 (iOS Safari ≤16.3 에서 번들 전체가 죽는다)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/filing-pdf-parse.ts', 'utf8');
    expect(src).not.toContain('(?<=');
    expect(src).not.toContain('(?<!');
  });
});

/* 2026-09-17: admin 에서 신고서 PDF 를 그대로 올리는 경로가 생겼다.
   브라우저(pdf.js)로 뽑은 글자는 서식의 자간이 그대로 살아 나와
   pdftotext 출력과 줄 모양이 다르다. 실제 신고서 2종(홈택스·위하고)에서
   확인한 차이를 회귀로 고정한다. */
describe('브라우저에서 뽑은 글자 — 자간이 살아 있는 출력물', () => {
  it('성명이 한 글자씩 떨어져 나와도 붙여서 읽는다', () => {
    const 자간 = SAMPLE.replace(
      '①성      명                 홍길동',
      '①  성   명          홍 길 동     ',
    );
    expect(parseFilingText(자간).owner.name).toBe('홍길동');
  });

  it('상호가 갈라져 나와도 한 상호로 읽는다', () => {
    const 자간 = SAMPLE.replace(
      '④상                 호                  테스트상사',
      '④ 상         호            테스트   상사',
    );
    expect(parseFilingText(자간).owner.company_name).toBe('테스트상사');
  });

  it('서식 제목의 연도가 "20 25" 로 갈라져도 소득공제(항번 20)로 오인하지 않는다', () => {
    const 갈라진연도 = SAMPLE.replace(
      '❹ 세액의 계산',
      '❹ 세액의 계산\n          ( 20 25  년  귀  속 )종 합 소 득 세 ㆍ 농 어 촌 특 별 세',
    );
    const r = parseFilingText(갈라진연도);
    expect(r.fields.income_deduction).toBe(5_000_000);
    expect(r.ok).toBe(true);
  });
});

/* 2026-09-18: 사장님이 준 실제 신고서 5건에서 나온 것들 */
describe('실제 신고서에서 잡힌 것 — 서식·마스킹·환급·적용률', () => {
  it('법인세 신고서를 종소세로 읽어 숫자를 만들어내지 않는다', () => {
    const 법인세 = `■ 법인세법 시행규칙 [별지 제1호서식]
                     법인세 과세표준 및 세액신고서
사 업 자 등 록 번 호        544-86-01500
사   업   연   도            2025.01.01 ~ 2025.12.31`;
    const r = parseFilingText(법인세);
    expect(r.type).toBe('법인세');
    /* 조정계산서가 없으니 세액은 하나도 안 읽힌다 — 종소세 칸으로 지어내지 않는다 */
    expect(r.fields.total_income).toBeUndefined();
    expect(r.fields.tax_base).toBeUndefined();
    expect(r.ok).toBe(false);
  });

  it('마스킹된 출력물은 "못 읽었다" 가 아니라 "가려졌다" 고 말한다', () => {
    const 마스킹 = SAMPLE
      .replace('①성      명                 홍길동', '①성      명                 홍***')
      .replace('900101-1987654', '900101-*******');
    const r = parseFilingText(마스킹);
    expect(r.masked).toBe(true);
    expect(r.owner.name).toBeUndefined();
    expect(r.owner.birth_date).toBeUndefined();
    expect(r.problems.join(' ')).toContain('마스킹');
    expect(r.ok).toBe(false);
  });

  it('환급 신고서의 마이너스 부호를 버리지 않는다', () => {
    const 환급 = SAMPLE.replace(
      '납 부(환급) 할 총 세 액(                         31   －    32   )   33                                10,000,000',
      '납 부(환급) 할 총 세 액(                         31   －    32   )   33                                -2,170,117',
    );
    expect(parseFilingText(환급).fields.payable_tax).toBe(-2_170_117);
  });

  it('공제 적용률 칸(12%)을 세액공제액으로 읽지 않는다', () => {
    const 보장성 = SAMPLE.replace(
      '                  표       준   세       액   공       제     284                               0',
      '                  보   장   성                 277      1,000,000    12%          120,000',
    );
    const d = parseFilingText(보장성).fields.공제감면?.find((x) => x.code === '277');
    expect(d?.amount).toBe(120_000);
  });

  it('가산세 기준칸의 "총수입금액" 을 매출로 읽지 않는다', () => {
    const 가산세칸 = SAMPLE.replace(
      '⑬ 세액공제명세서',
      '⑧공동사업장등록   미등록ㆍ허위등록   총 수 입 금 액    999,999,999    0.5/100\n⑬ 세액공제명세서',
    );
    expect(parseFilingText(가산세칸).fields.revenue).toBe(450_000_000);
  });
});

describe('사업소득금액 — 종합소득금액과 다르다 (근로소득이 섞인 신고서)', () => {
  it('⑩필요경비·⑪소득금액을 읽고 수입금액에 검산을 건다', () => {
    const r = parseFilingText(SAMPLE);
    expect(r.fields.expense_total).toBe(350_000_000);
    expect(r.fields.business_income).toBe(100_000_000);
    expect(r.checks.map((c) => c.label)).toContain('사업소득금액 = 총수입금액 − 필요경비');
  });

  it('매출만 틀리면 다른 검산은 다 맞아도 잡아낸다 (예전엔 조용히 통과했다)', () => {
    const 매출틀림 = SAMPLE.replace(
      '⑨총 수 입 금 액                                   400,000,000            50,000,000',
      '⑨총 수 입 금 액                                   400,000,000            90,000,000',
    );
    const r = parseFilingText(매출틀림);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('사업소득금액 = 총수입금액 − 필요경비');
  });

  it('❼명세서가 비어 검산을 못 걸면 건너뛴 것으로 남긴다 (통과가 아니다)', () => {
    const 명세서없음 = SAMPLE
      .replace('⑩필         요   경        비                    340,000,000            10,000,000\n', '')
      .replace('⑪ 소 득 금 액(⑨ - ⑩)                              60,000,000            40,000,000\n', '');
    const r = parseFilingText(명세서없음);
    expect(r.skipped_checks).toContain('사업소득금액 = 총수입금액 − 필요경비');
    expect(r.ok).toBe(false);
  });
});

/* ── 법인세 (별지 제1호서식 + 별지 제3호서식) ──
   조정계산서는 행마다 일련번호(01~64)가 있고 그 뒤가 금액이다. 라벨이 두 줄로
   쪼개지고 좌·우 두 칸이 한 줄에 나란히 찍혀도 일련번호는 안 흔들린다.
   숫자는 실제 신고서에서 가져오되 법인명·사업자번호는 가상으로 바꿨다. */
const CORP = `■ 법인세법 시행규칙 [별지 제1호서식]
                              법인세 과세표준 및 세액신고서
사 업 자 등 록 번 호     123-86-01234                  법 인 등 록 번 호     170111-0000000
법     인     명       주식회사 테스트상사                  전 화 번 호       053-000-0000
대 표 자 성 명           홍길동                            전 자 우 편 주 소   test@example.com
사   업   연   도        2025.01.01 ~ 2025.12.31

수   입   금   액                                                 ( 500,000,000 )
과   세   표   준                              400,000,000
산   출   세   액                               60,000,000

                ~                 법인세 과세표준 및 세액조정계산서
            2025.12.31                                     사업자등록번호           123-86-01234

    101 결 산 서 상 당 기 순 손 익 01               390,000,000       133 감 면 분 추 가 납 부 세 액 29                0
              102     익 금 산 입 02                20,000,000       134 차 감 납 부 할 세 액
              103     손 금 산 입 03                10,000,000            (125-132+133)
                                                                                30          48,000,000
연   104 차 가 감 소 득 금 액
                      04                   400,000,000
도       (101＋102－103)
득   105 기 부 금 한 도 초 과 액 05                          0
산   106 기 부 금 한 도 초 과 이 월 액 54                      0
    107 각 사 업 연 도 소 득 금 액
                            06             400,000,000
         (104+105-106)
②   109 이     월       결       손   금 07              0
세   110 비     과       세       소   득 08              0
계   111 소        득        공       제 09              0
    112 과     세    표              준
                                      10   400,000,000
       (108－109－110-111)
    113   과 세 표 준(112+159) 56             400,000,000
  114   세   율  ( % ) 11                         19.00
산 115 산        출   세   액 12                  60,000,000
    118 산        출        세       액 15              0
    119 합 계 ( 1 1 5 ＋ 1 1 8 ) 16            60,000,000
    120 산 출 세 액(120=119 )                   60,000,000
    121 최 저 한 세           적용대상
        공 제 감             면 세 액 17          10,000,000
    122 차        감        세       액 18      50,000,000
    123 최 저 한 세           적용제외
        공 제 감             면 세 액 19                  0
④ 124 가    산    세     액               20            0
부 125 가 감 계(122-123+124)              21    50,000,000
    130 소            계
         (126＋127＋128+129)
                           26                 2,000,000
      131 신 고 납 부 전 가 산 세 액 27                      0
      132 합      계 ( 1 3 0 + 1 3 1 ) 28       2,000,000
■ 법인세법 시행규칙 [별지 제2호서식]
`;

describe('법인세 신고서', () => {
  const r = parseFilingText(CORP);

  it('법인세로 인식한다', () => {
    expect(r.type).toBe('법인세');
    expect(r.unsupported).toBeUndefined();
  });

  it('법인·사업연도를 읽는다', () => {
    expect(r.owner.company_name).toBe('주식회사 테스트상사');
    expect(r.owner.biz_no).toBe('1238601234');
    expect(r.owner.name).toBe('홍길동');      /* 대표자 — 표시용 */
    expect(r.fiscal_year).toBe(2025);
  });

  it('법인 검토표 칸을 전부 채운다', () => {
    expect(r.fields).toMatchObject({
      revenue: 500_000_000,
      net_income: 390_000_000,
      adj_inclusion: 20_000_000,
      adj_exclusion: 10_000_000,
      business_income: 400_000_000,
      tax_base: 400_000_000,
      calculated_tax: 60_000_000,
      deduction_total: 10_000_000,
      penalty_total: 0,
      decisive_tax: 50_000_000,
      prepaid_tax: 2_000_000,
      additional_tax: 0,
      payable_tax: 48_000_000,
    });
  });

  it('검산 6개가 전부 통과한다', () => {
    expect(r.checks.length).toBe(6);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.skipped_checks).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('익금산입을 틀리게 읽으면 잡아낸다', () => {
    const bad = CORP.replace('익 금 산 입 02                20,000,000', '익 금 산 입 02                25,000,000');
    const b = parseFilingText(bad);
    expect(b.ok).toBe(false);
    expect(b.problems.join(' ')).toContain('차가감소득금액');
  });

  it('조정자(세무사 사무실) 사업자번호를 법인 번호로 오인하지 않는다', () => {
    const 조정자 = CORP.replace(
      '■ 법인세법 시행규칙 [별지 제2호서식]',
      '조 정 자   성 명  세무회계 이윤\n           사업자등록번호   549-79-00291\n■ 법인세법 시행규칙 [별지 제2호서식]',
    );
    expect(parseFilingText(조정자).owner.biz_no).toBe('1238601234');
  });

  it('마스킹된 법인 신고서는 포함하지 않는다', () => {
    const 마스킹 = CORP
      .replace(/123-86-01234/g, '123-86-012**')
      .replace('170111-0000000', '170111-*******')
      .replace('법     인     명       주식회사 테스트상사', '법     인     명       주식*****');
    const m = parseFilingText(마스킹);
    expect(m.masked).toBe(true);
    expect(m.owner.biz_no).toBeUndefined();
    expect(m.owner.company_name).toBeUndefined();
    expect(m.ok).toBe(false);
  });
});

/* 2026-09-18 실측 22건에서 나온 것 */
describe('사업장이 여러 개인 신고서', () => {
  it('조정후총수입금액 명세서가 사업장마다 있으면 전부 더한다', () => {
    /* ❼명세서가 빈 출력물의 대체 칸. 첫 장만 쓰면 사업장 하나치만 매출이 된다
       (실측: 12,000,000 만 잡히고 483,487,698 이 빠졌다). */
    const 명세서둘 = SAMPLE
      .replace('⑨총 수 입 금 액                                   400,000,000            50,000,000\n', '')
      .replace('⑩필         요   경        비                    340,000,000            10,000,000\n', '')
      .replace('⑪ 소 득 금 액(⑨ - ⑩)                              60,000,000            40,000,000\n', '')
      .replace('⑬ 세액공제명세서',
        '⑮조정후총수입금액(⑫+⑬-⑭=④)                                   12,000,000\n'
        + '⑮조정후총수입금액(⑫+⑬-⑭=④)                                  483,487,698\n⑬ 세액공제명세서');
    expect(parseFilingText(명세서둘).fields.revenue).toBe(495_487_698);
  });

  it('사업장이 둘 이상이면 상호를 비운다 (하나로 특정할 수 없다)', () => {
    const 사업장셋 = SAMPLE.replace(
      '⑤사업자등록번호                              123-45-67890          000-00-00000',
      '⑤사업자등록번호                              000-00-00000   405-27-02160   294-63-00497',
    );
    const r = parseFilingText(사업장셋);
    expect(r.owner.company_name).toBeUndefined();
    expect(r.owner.biz_no).toBe('4052702160');   /* 매칭은 첫 사업자번호로 계속 된다 */
  });

  it('사업장이 하나면 상호를 그대로 읽는다', () => {
    expect(parseFilingText(SAMPLE).owner.company_name).toBe('테스트상사');
  });
});

/* 2026-09-21 사장님: "근로소득이랑 사업매출은 구분되야할거야."
   실측: 사업 매출 26,363,636 인데 종합소득금액은 84,561,242 — 차액 8,145만이
   근로소득이다. ❺명세서의 소득구분코드 51 행을 읽어 따로 세운다. */
describe('근로소득 — 사업 매출과 섞이면 안 된다', () => {
  const 근로 = SAMPLE.replace(
    '❼ 사업소득명세서',
    `          소득의 지급자
소득    ②                    ⑤ 총수입금액 (근로소득공 ⑦ 소득금액
코드         ④ 사업자등록번호                 공제)
51   1                      30,000,000 10,000,000   20,000,000  1,000,000         0
❾ 종합소득금액 및 결손금ㆍ이월결손금공제명세서

❼ 사업소득명세서`,
  ).replace(
    '            액         금                      19                               100,000,000',
    '            액         금                      19                               120,000,000',
  ).replace(
    '과   세    표   준 ( 19 － 20 )                                  21                                95,000,000',
    '과   세    표   준 ( 19 － 20 )                                  21                               115,000,000',
  );

  it('근로소득 총급여·소득금액을 따로 읽는다', () => {
    const r = parseFilingText(근로);
    expect(r.fields.salary_gross).toBe(30_000_000);
    expect(r.fields.salary_income).toBe(20_000_000);
    /* 매출은 사업 것만 — 급여를 더하지 않는다 */
    expect(r.fields.revenue).toBe(450_000_000);
    expect(r.fields.business_income).toBe(100_000_000);
  });

  it('종합소득금액 = 사업소득 + 근로소득 을 검산한다', () => {
    const r = parseFilingText(근로);
    expect(r.checks.map((c) => c.label)).toContain('종합소득금액 = 사업소득금액 + 사업 외 소득(근로 등)');
    expect(r.checks.find((c) => c.label.startsWith('종합소득금액 ='))?.ok).toBe(true);
  });

  it('근로소득을 빠뜨리면 잡아낸다', () => {
    /* ❺명세서가 안 읽히면 종합소득금액이 사업소득보다 커서 검산이 어긋난다 */
    const 누락 = 근로.replace('51   1                      30,000,000 10,000,000   20,000,000  1,000,000         0\n', '');
    const r = parseFilingText(누락);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('종합소득금액 = 사업소득금액');
  });

  it('기부금명세서의 비슷한 줄을 근로소득으로 읽지 않는다', () => {
    /* 문서 뒤쪽에 "40  2025  50,000 …" 처럼 같은 모양의 줄이 있다 */
    const 기부금 = SAMPLE + '\n⑭ 기부금명세서\n 40    2025         50,000                    0             50,000                0\n';
    expect(parseFilingText(기부금).fields.salary_income).toBeUndefined();
  });
});

/* 2026-09-21 사장님: "사업장별 매출 이거도 해보자 나누는거 충분히 될건데??"
   ❼명세서의 한 칸이 사업장 하나다. 합계만 저장하면 "OO점 매출" 에 답할 수가 없다.
   ⚠ 여기서 틀리면 검산이 못 잡는 구간이 생긴다 — 합이 총수입금액과 맞는지 반드시 건다. */
describe('사업장별 내역', () => {
  it('SAMPLE 의 사업장 2곳을 칸 순서대로 나눈다', () => {
    const r = parseFilingText(SAMPLE);
    expect(r.fields.businesses).toEqual([
      { revenue: 400_000_000, biz_no: '1234567890', expense: 340_000_000, income: 60_000_000 },
      { revenue: 50_000_000, biz_no: '0000000000', expense: 10_000_000, income: 40_000_000 },
    ]);
  });

  it('사업장별 합 = 총수입금액 검산이 걸린다', () => {
    const r = parseFilingText(SAMPLE);
    const c = r.checks.find((x) => x.label === '사업장별 수입금액 합 = 총수입금액');
    expect(c?.ok).toBe(true);
    expect(r.fields.businesses!.reduce((a, b) => a + b.revenue, 0)).toBe(r.fields.revenue);
  });

  /* 실측(이상환 님): 같은 사업자번호가 두 번 — 부동산임대(30)와 사업(40)을 나눠 신고.
     사업자번호를 키로 쓰면 한 칸이 사라진다. 칸 순서로 잡아야 한다. */
  it('같은 사업자등록번호가 두 번 나와도 두 칸으로 유지한다', () => {
    const 임대 = SAMPLE.replace(
      '⑤사업자등록번호                              123-45-67890          000-00-00000',
      `①소득구분코드                                      30                    40
⑤사업자등록번호                              123-45-67890          123-45-67890`,
    );
    const r = parseFilingText(임대);
    expect(r.fields.businesses).toHaveLength(2);
    expect(r.fields.businesses!.map((b) => b.biz_no)).toEqual(['1234567890', '1234567890']);
    expect(r.fields.businesses!.map((b) => b.income_code)).toEqual(['30', '40']);
    expect(r.fields.businesses!.map((b) => b.revenue)).toEqual([400_000_000, 50_000_000]);
  });

  it('사업장 3곳도 칸 순서가 어긋나지 않는다', () => {
    const 삼 = SAMPLE
      .replace(
        '⑤사업자등록번호                              123-45-67890          000-00-00000',
        `①소득구분코드                                      32                    40                    40
⑤사업자등록번호                              000-00-00000          123-45-67890          222-33-44444`,
      )
      .replace('⑨총 수 입 금 액                                   400,000,000            50,000,000',
        '⑨총 수 입 금 액                                    30,000,000            20,000,000           400,000,000')
      .replace('⑩필         요   경        비                    340,000,000            10,000,000',
        '⑩필         요   경        비                     20,000,000            10,000,000           320,000,000')
      .replace('⑪ 소 득 금 액(⑨ - ⑩)                              60,000,000            40,000,000',
        '⑪ 소 득 금 액(⑨ - ⑩)                              10,000,000            10,000,000            80,000,000');
    const r = parseFilingText(삼);
    expect(r.fields.revenue).toBe(450_000_000);
    expect(r.fields.businesses).toEqual([
      { revenue: 30_000_000, biz_no: '0000000000', income_code: '32', expense: 20_000_000, income: 10_000_000 },
      { revenue: 20_000_000, biz_no: '1234567890', income_code: '40', expense: 10_000_000, income: 10_000_000 },
      { revenue: 400_000_000, biz_no: '2223344444', income_code: '40', expense: 320_000_000, income: 80_000_000 },
    ]);
    expect(r.checks.find((c) => c.label === '사업장별 수입금액 합 = 총수입금액')?.ok).toBe(true);
  });

  /* 칸 수가 어긋나면 엉뚱한 사업장에 금액이 붙는다 — 틀리느니 아예 안 내놓는다 */
  it('⑩⑪ 칸 수가 ⑨와 다르면 통째로 포기한다', () => {
    const 어긋남 = SAMPLE.replace(
      '⑩필         요   경        비                    340,000,000            10,000,000',
      '⑩필         요   경        비                    350,000,000',
    );
    const r = parseFilingText(어긋남);
    expect(r.fields.businesses).toBeUndefined();
    /* 나머지 합계 검산은 그대로 살아 있어야 한다 */
    expect(r.fields.revenue).toBe(450_000_000);
  });

  it('사업자번호 칸 수가 안 맞으면 금액만 남기고 번호는 안 붙인다', () => {
    const 번호부족 = SAMPLE.replace(
      '⑤사업자등록번호                              123-45-67890          000-00-00000',
      '⑤사업자등록번호                              123-45-67890',
    );
    const r = parseFilingText(번호부족);
    expect(r.fields.businesses).toEqual([
      { revenue: 400_000_000, expense: 340_000_000, income: 60_000_000 },
      { revenue: 50_000_000, expense: 10_000_000, income: 40_000_000 },
    ]);
  });

  it('④상호는 읽지 않는다 (칸이 섞여 나온다 — DB 회사명을 쓴다)', () => {
    const r = parseFilingText(SAMPLE);
    expect(r.fields.businesses!.every((b) => !('name' in b))).toBe(true);
  });

  it('법인세에는 사업장별 내역이 없다', () => {
    const r = parseFilingText(SAMPLE);
    expect(r.type).toBe('종소세');
  });
});
