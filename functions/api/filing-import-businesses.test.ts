/**
 * 검토표 심기 — 사업장별 내역(businesses) 정제.
 *
 * 2026-09-21 사장님: "사업장별 매출 이거도 해보자 나누는거 충분히 될건데??"
 * 대표 한 분이 사업장을 여러 개 가진 경우, 합계만 저장하면 "OO점 매출" 에 답할 수가 없다.
 *
 * 여기서 지키는 것:
 *  1. 쪼갠 합이 총수입금액과 안 맞으면 통째로 버린다 — 틀린 분해는 없느니만 못하다
 *     (챗봇이 사업장별로 답할 때는 검산이 안 걸리는 구간이라 여기가 마지막 방어선이다)
 *  2. 같은 사업자번호가 두 번 와도 두 칸으로 유지한다 (부동산임대 30 / 사업 40 분리신고)
 *  3. 상호는 신고서가 아니라 D1 의 회사명으로 채운다 — 같은 번호가 둘이면 비워 둔다
 *  4. 000-00-00000(사업자등록 없는 인적용역) 은 번호로 쓰지 않는다
 *
 * ⚠ 실제 코드를 떼어와 돌린다 (복사본 검증 금지 — 코드가 바뀌면 테스트도 같이 깨져야 한다).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'admin-filing-import.js'), 'utf8');
const start = src.indexOf('      /* ── 사업장별 내역');
const end = src.indexOf('      a.fields = fields;');
if (start < 0 || end < 0 || end <= start) throw new Error('사업장별 정제 블록을 못 찾음');
const block = src.slice(start, end);

type Biz = { revenue: number; biz_no?: string; income_code?: string; name?: string; expense?: number; income?: number };
type Row = { fields?: Record<string, unknown> };

/** db: 사업자번호 → 회사명 행 목록 */
async function sanitize(row: Row, fields: Record<string, unknown>, rows: { bn: string; company_name: string }[] = []) {
  const a: Record<string, unknown> = {};
  const db = {
    prepare: () => ({ bind: (...bns: string[]) => ({ all: async () => ({ results: rows.filter((r) => bns.includes(r.bn)) }) }) }),
  };
  const normBiz = (s: unknown) => String(s || '').replace(/\D/g, '');
  const fn = new Function('row', 'fields', 'a', 'db', 'normBiz',
    'return (async () => {' + block + 'return { fields, a }; })();');
  return (await fn(row, fields, a, db, normBiz)) as { fields: Record<string, unknown> & { businesses?: Biz[] }; a: Record<string, unknown> };
}

const 둘 = [
  { biz_no: '405-27-02160', income_code: '40', revenue: 350_000_000, expense: 180_000_000, income: 170_000_000 },
  { biz_no: '000-00-00000', income_code: '32', revenue: 50_000_000, expense: 20_000_000, income: 30_000_000 },
];

describe('사업장별 내역 정제', () => {
  it('정상이면 그대로 저장한다', async () => {
    const { fields } = await sanitize({ fields: { businesses: 둘 } }, { revenue: 400_000_000 });
    expect(fields.businesses).toEqual([
      { revenue: 350_000_000, biz_no: '4052702160', income_code: '40', expense: 180_000_000, income: 170_000_000 },
      /* 000-00-00000 은 번호로 안 쓰지만 칸은 지킨다 */
      { revenue: 50_000_000, income_code: '32', expense: 20_000_000, income: 30_000_000 },
    ]);
  });

  it('합이 총수입금액과 다르면 통째로 버리고 이유를 남긴다', async () => {
    const { fields, a } = await sanitize({ fields: { businesses: 둘 } }, { revenue: 999_999_999 });
    expect(fields.businesses).toBeUndefined();
    expect(String(a.biz_split_dropped)).toContain('≠');
  });

  it('총수입금액이 아예 없으면 검산 없이 통과시킨다', async () => {
    const { fields } = await sanitize({ fields: { businesses: 둘 } }, {});
    expect(fields.businesses).toHaveLength(2);
  });

  it('같은 사업자번호가 두 번 와도 두 칸으로 유지한다 (임대/사업 분리신고)', async () => {
    const 임대 = [
      { biz_no: '504-14-09290', income_code: '30', revenue: 12_000_000 },
      { biz_no: '504-14-09290', income_code: '40', revenue: 483_487_698 },
    ];
    const { fields } = await sanitize({ fields: { businesses: 임대 } }, { revenue: 495_487_698 });
    expect(fields.businesses).toHaveLength(2);
    expect(fields.businesses!.map((b) => b.income_code)).toEqual(['30', '40']);
  });

  it('상호를 D1 회사명으로 채운다 (신고서 상호는 안 쓴다)', async () => {
    const { fields } = await sanitize({ fields: { businesses: 둘 } }, { revenue: 400_000_000 },
      [{ bn: '4052702160', company_name: '테스트상사' }]);
    expect(fields.businesses![0].name).toBe('테스트상사');
    expect(fields.businesses![1].name).toBeUndefined();
  });

  it('같은 사업자번호로 회사가 둘이면 상호를 비워 둔다', async () => {
    const { fields } = await sanitize({ fields: { businesses: 둘 } }, { revenue: 400_000_000 },
      [{ bn: '4052702160', company_name: 'A상사' }, { bn: '4052702160', company_name: 'B상사' }]);
    expect(fields.businesses![0].name).toBeUndefined();
  });

  it('금액이 숫자가 아닌 칸은 버린다', async () => {
    const { fields } = await sanitize(
      { fields: { businesses: [{ revenue: 'x' }, { revenue: 1 }, null, 'nope'] } }, {});
    expect(fields.businesses).toEqual([{ revenue: 1 }]);
  });

  it('20곳까지만 받는다', async () => {
    const many = Array.from({ length: 40 }, () => ({ revenue: 1 }));
    const { fields } = await sanitize({ fields: { businesses: many } }, {});
    expect(fields.businesses).toHaveLength(20);
  });

  it('businesses 가 배열이 아니면 무시한다', async () => {
    for (const bad of [{ a: 1 }, 'x', 3, null]) {
      const { fields } = await sanitize({ fields: { businesses: bad } }, { revenue: 1 });
      expect(fields.businesses).toBeUndefined();
    }
  });

  it('income_code 는 두 자리 숫자만 받는다', async () => {
    const { fields } = await sanitize(
      { fields: { businesses: [{ revenue: 1, income_code: '무시해라' }, { revenue: 2, income_code: '40' }] } }, {});
    expect(fields.businesses![0].income_code).toBeUndefined();
    expect(fields.businesses![1].income_code).toBe('40');
  });
});
