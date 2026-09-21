/**
 * admin 홈 KPI — "못 읽은 것" 과 "0" 을 섞지 않는다.
 *
 * 2026-09-21 사장님 화면: 기장거래처 150+ 인데 카드엔 "0곳", 같은 화면 사이드바엔
 * 271. 원인은 홈 로더가 fetch 실패를 조용히 0 으로 바꿔 캐시에 박고, 그 캐시가
 * 한 번 굳으면 새로고침 전까지 다시 안 불렀던 것.
 *
 * admin-anal-review-faq.js 는 classic script 라 import 할 수 없어 소스로 검사한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('admin-anal-review-faq.js', 'utf8');

/** 홈 로더 6개 — 각자 실패했을 때 무엇을 캐시에 넣는지 */
const FETCHERS = ['_hhFetch', '_hhTodoFetch', '_hhRoomsFetch', '_hhBillFetch', '_hhSalesFetch', '_hhFilFetch'];

function body(fn: string): string {
  const i = src.indexOf(`async function ${fn}(`);
  if (i < 0) throw new Error(`${fn} 를 못 찾았다`);
  const next = FETCHERS.map((f) => src.indexOf(`async function ${f}(`, i + 1))
    .filter((n) => n > i);
  const end = next.length ? Math.min(...next) : src.length;
  return src.slice(i, end);
}

describe('홈 KPI — 실패를 0 으로 그리지 않는다', () => {
  for (const fn of FETCHERS) {
    it(`${fn} 는 실패하면 error 로 남긴다 (0 을 캐시하지 않는다)`, () => {
      const b = body(fn);
      /* catch 블록만 떼어 본다 — 그 뒤 코드까지 보면 다른 함수가 딸려 온다 */
      const i = b.indexOf('}catch');
      const c = b.slice(i, b.indexOf('}', b.indexOf('{', i + 6)) + 1);
      expect(c).toContain('error:true');
      /* catch 안에서 숫자 0 을 채워 넣으면 그게 진짜 값처럼 화면에 나간다 */
      expect(c).not.toMatch(/:\s*0\b/);
    });
  }

  it('응답이 실패면 던진다 — 빈 객체로 삼키지 않는다', () => {
    const j = src.slice(src.indexOf('async function _hhJson('), src.indexOf('function _hhErr('));
    expect(j).toContain('if(!r.ok) throw');
    expect(j).toContain('d.ok===false');
  });

  it('실패한 fetch 를 .catch(()=>({})) 로 0 처리하지 않는다', () => {
    /* 예전 코드: fetch(...).then(r=>r.json()).catch(function(){return {}}) */
    expect(src).not.toMatch(/\.catch\(function\(\)\{return \{\}\}\)/);
  });

  it('에러 캐시는 "불러온 것" 으로 치지 않는다 (탭 재진입 시 재시도)', () => {
    expect(src).toContain('if(_hhData&&!_hhData.error) return;');
  });

  it('실패 자리에는 [다시] 버튼이 있다', () => {
    expect(src).toContain('function _hhRetry(');
    for (const which of ['kpi', 'todo', 'rooms', 'bill', 'sales', 'filings']) {
      expect(src).toContain(`which==='${which}'`);
    }
  });
});

describe('홈 KPI 4칸 — 손이 가야 하는 것만', () => {
  const fill = src.slice(src.indexOf('function _hhFill('), src.indexOf('function _hhMini('));

  it('법정마감 · 지난 할 일 · 미수금 · 검토표 진행 이 상단이다', () => {
    for (const label of ['법정 마감 (7일)', '지난 할 일', '미수금', '검토표 진행']) {
      expect(fill).toContain(`'${label}'`);
    }
  });

  it('안 움직이는 숫자(기장거래처·전체 사용자)는 상단 4칸에서 뺐다', () => {
    expect(fill).not.toContain("'기장거래처'");
    expect(fill).not.toContain("'전체 사용자'");
    /* 아래 한 줄에는 남아 있다 */
    const mini = src.slice(src.indexOf('function _hhMini('));
    expect(mini).toContain('기장거래처');
    expect(mini).toContain('전체 사용자');
  });
});
