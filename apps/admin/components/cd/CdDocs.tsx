/**
 * Phase 3.4.D (2026-05-08): 거래처 dashboard 문서 현황 (cdDocs) React.
 *
 * 4개 카운트 박스 — 대기 / 승인 / 반려 / 총 (grid 2x2).
 * $dashboard.docCounts 자동 reactive.
 */
import { useStore } from '@nanostores/react';
import { $dashboard } from '@/state/dashboard-store';

interface BoxProps {
  bg: string;
  fg: string;
  label: string;
  value: number;
}

function Box({ bg, fg, label, value }: BoxProps) {
  return (
    <div style={{ padding: '8px 10px', background: bg, borderRadius: '6px' }}>
      <div style={{ fontSize: '.72em', color: fg }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.1em' }}>{value}</div>
    </div>
  );
}

export function CdDocs() {
  const s = useStore($dashboard);
  const c = s.docCounts || {};
  const pending = Number(c.pending) || 0;
  const approved = Number(c.approved) || 0;
  const rejected = Number(c.rejected) || 0;
  const total = pending + approved + rejected;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
      <Box bg="#fef3c7" fg="#92400e" label="⏳ 대기" value={pending} />
      <Box bg="#d1fae5" fg="#065f46" label="✅ 승인" value={approved} />
      <Box bg="#fee2e2" fg="#991b1b" label="❌ 반려" value={rejected} />
      <Box bg="#e0f2fe" fg="#075985" label="📊 총" value={total} />
    </div>
  );
}
