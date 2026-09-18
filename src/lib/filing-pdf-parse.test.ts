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

  it('검산 5개가 전부 통과한다', () => {
    expect(r.checks.length).toBe(5);
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
  it('법인세 신고서는 읽지 않고 끊는다 (종소세로 오인해 숫자를 만들어내면 안 된다)', () => {
    const 법인세 = `■ 법인세법 시행규칙 [별지 제1호서식]
                     법인세 과세표준 및 세액신고서
사 업 자 등 록 번 호        544-86-01500
사   업   연   도            2025.01.01 ~ 2025.12.31`;
    const r = parseFilingText(법인세);
    expect(r.unsupported).toContain('법인세');
    expect(r.fields).toEqual({});
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
