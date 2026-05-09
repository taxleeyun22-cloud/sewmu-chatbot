/**
 * Phase Next-Day22 (2026-05-09): buildSystemPrompt 단위 테스트.
 *
 * CLAUDE.md 룰 — 답변 정확성·할루시네이션 차단·수수료 금지 명시.
 */
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, CORE_RULES } from './system-prompt';

describe('CORE_RULES', () => {
  it('prohibits fee/peer recommendation (CLAUDE.md 절대 규칙)', () => {
    expect(CORE_RULES).toContain('수수료/기장료 금액 절대 언급 금지');
    expect(CORE_RULES).toContain('다른 세무사 추천 금지');
  });

  it('prohibits bold formatting + requires confidence tag', () => {
    expect(CORE_RULES).toContain('볼드체');
    expect(CORE_RULES).toContain('[신뢰도: 높음/보통/낮음]');
  });

  it('mentions 할루시네이션 차단', () => {
    expect(CORE_RULES).toMatch(/할루시네이션|확인이 필요/);
  });

  it('includes office contact', () => {
    expect(CORE_RULES).toContain('053-269-1213');
    expect(CORE_RULES).toContain('이재윤');
  });
});

describe('buildSystemPrompt', () => {
  it('default (no options) → CORE_RULES only', () => {
    const out = buildSystemPrompt();
    expect(out).toContain('수수료/기장료 금액 절대 언급 금지');
    expect(out).not.toContain('현재 상담자');
  });

  it('appends user context when userName provided', () => {
    const out = buildSystemPrompt({ userName: '박승호' });
    expect(out).toContain('현재 상담자');
    expect(out).toContain('박승호');
  });

  it('includes approval status + daily limit (when finite)', () => {
    const out = buildSystemPrompt({
      userName: '박승호',
      approvalStatus: 'pending',
      dailyLimit: 5,
    });
    expect(out).toContain('상태: pending');
    expect(out).toContain('일 사용 한도: 5');
  });

  it('skips limit display for 무제한 (999999)', () => {
    const out = buildSystemPrompt({
      userName: '사장',
      approvalStatus: 'approved_client',
      dailyLimit: 999999,
    });
    expect(out).not.toContain('일 사용 한도:');
  });

  it('approvalStatus alone (no userName) → no context block', () => {
    const out = buildSystemPrompt({ approvalStatus: 'pending' });
    expect(out).not.toContain('현재 상담자');
  });
});
