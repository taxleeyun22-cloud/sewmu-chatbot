/**
 * Phase 3.4.D (2026-05-08): 거래처 dashboard 문서 현황 (cdDocs) React.
 *
 * 4개 카운트 박스 — 대기 / 승인 / 반려 / 총 (grid 2x2).
 * $dashboard.docCounts 자동 reactive.
 */
import { useStore } from '@nanostores/react';
import { $dashboard } from '../../admin/state/dashboard-store';

interface BoxProps {
  /** 숫자 색 — 토스-1 v2 (2026-06-12): 타일은 전부 회색, 숫자만 의미색 */
  numColor: string;
  label: string;
  value: number;
}

function Box({ numColor, label, value }: BoxProps) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--gray-100)', borderRadius: '14px' }}>
      <div style={{ fontSize: '.72em', color: 'var(--text-mute)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.35em', color: numColor, letterSpacing: '-.03em' }}>{value}</div>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
      <Box numColor="var(--text-main)" label="⏳ 대기" value={pending} />
      <Box numColor="var(--of-success)" label="✅ 승인" value={approved} />
      <Box numColor="var(--toss-red)" label="❌ 반려" value={rejected} />
      <Box numColor="var(--of-primary)" label="📊 총" value={total} />
    </div>
  );
}
