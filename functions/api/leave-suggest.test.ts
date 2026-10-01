/**
 * 연차 제안값 (회계연도 기준) — 사장님이 확정해야 실제 부여된다.
 *
 * ⚠ 근로기준법 제60조 원문 대조 전 (작성 세션에서 법령정보센터 접속 차단).
 *   값이 바뀌면 이 표부터 같이 고친다 — 제안값과 근거 문장이 어긋나면 안 된다.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { suggestLeave } from './_attendance-core.js';

describe('suggestLeave', () => {
  it('입사 전 연도는 0일', () => {
    expect(suggestLeave('2026-03-02', 2025)!.days).toBe(0);
  });

  it('입사한 해 — 1개월 개근마다 1일 (3/2 입사 → 4/2~12/2 9일)', () => {
    const r = suggestLeave('2026-03-02', 2026)!;
    expect(r.days).toBe(9);
    expect(r.basis).toContain('입사한 해');
  });

  it('입사 다음 해 — 비례분 + 1년 전까지 남은 월 1일', () => {
    /* 2026-03-02 ~ 2026-12-31 = 305일 → 15 × 305/365 = 12.53 → 12.5
       2027-01-02, 2027-02-02 = 월 1일 × 2 → 14.5 */
    const r = suggestLeave('2026-03-02', 2027)!;
    expect(r.days).toBe(14.5);
    expect(r.basis).toContain('305/365');
  });

  it('1/1 입사면 다음 해는 15일 그대로', () => {
    expect(suggestLeave('2026-01-01', 2027)!.days).toBe(15);
  });

  it('근속 2년차 15 / 3년차 16 / 4년차 16 / 5년차 17', () => {
    expect(suggestLeave('2023-03-02', 2025)!.days).toBe(15);
    expect(suggestLeave('2023-03-02', 2026)!.days).toBe(16);
    expect(suggestLeave('2023-03-02', 2027)!.days).toBe(16);
    expect(suggestLeave('2023-03-02', 2028)!.days).toBe(17);
  });

  it('25일 한도', () => {
    expect(suggestLeave('2000-01-10', 2026)!.days).toBe(25);
    expect(suggestLeave('2000-01-10', 2026)!.basis).toContain('25일 한도');
  });

  it('입사일이 없거나 잘못되면 제안하지 않는다', () => {
    expect(suggestLeave('', 2026)).toBeNull();
    expect(suggestLeave('2026-02-30', 2026)).toBeNull();
  });

  it('월말 입사도 다음 달 말일로 맞춘다 (1/31 → 2/28 …)', () => {
    /* 2026-01-31 입사: 2/28, 3/31, … 12/31 = 11일 (최대 11) */
    expect(suggestLeave('2026-01-31', 2026)!.days).toBe(11);
  });
});
