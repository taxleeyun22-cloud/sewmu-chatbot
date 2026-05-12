/**
 * Phase 11 cleanup (2026-05-12): dashboard badge variant 결정 — 순수 함수.
 * 단위 테스트 가능 (`page.tsx` 안 inline 으로 두지 말 것).
 */

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'default';

/**
 * AI 답변 신뢰도 → badge variant.
 * - "높음" → success (초록)
 * - "보통" → warning (노랑)
 * - "낮음" → danger (빨강)
 */
export function confidenceBadge(c: string | null | undefined): BadgeVariant {
  if (c === '높음') return 'success';
  if (c === '보통') return 'warning';
  if (c === '낮음') return 'danger';
  return 'default';
}

/**
 * 문서 검토 상태 → badge variant.
 * - approved → success
 * - pending → warning
 * - rejected → danger
 */
export function docBadge(s: string | null | undefined): BadgeVariant {
  if (s === 'approved') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'rejected') return 'danger';
  return 'default';
}
