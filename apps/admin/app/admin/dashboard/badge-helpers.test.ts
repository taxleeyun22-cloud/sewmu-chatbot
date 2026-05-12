/**
 * Phase 11 cleanup (2026-05-12): badge helpers 단위 테스트.
 */
import { describe, it, expect } from 'vitest';
import { confidenceBadge, docBadge } from './badge-helpers';

describe('confidenceBadge', () => {
  it('"높음" → success', () => {
    expect(confidenceBadge('높음')).toBe('success');
  });
  it('"보통" → warning', () => {
    expect(confidenceBadge('보통')).toBe('warning');
  });
  it('"낮음" → danger', () => {
    expect(confidenceBadge('낮음')).toBe('danger');
  });
  it('null/undefined/unknown → default', () => {
    expect(confidenceBadge(null)).toBe('default');
    expect(confidenceBadge(undefined)).toBe('default');
    expect(confidenceBadge('이상한값')).toBe('default');
  });
});

describe('docBadge', () => {
  it('approved → success', () => {
    expect(docBadge('approved')).toBe('success');
  });
  it('pending → warning', () => {
    expect(docBadge('pending')).toBe('warning');
  });
  it('rejected → danger', () => {
    expect(docBadge('rejected')).toBe('danger');
  });
  it('null/unknown → default', () => {
    expect(docBadge(null)).toBe('default');
    expect(docBadge('잠시만요')).toBe('default');
  });
});
