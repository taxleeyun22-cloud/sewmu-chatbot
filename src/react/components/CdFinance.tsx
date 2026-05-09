/**
 * Phase 3.4.D (2026-05-08): 거래처 dashboard 재무 요약 (cdFinance) React.
 *
 * $dashboard.finance 자동 reactive.
 * has_data 면 최근 3건 row, 아니면 안내 메시지.
 */
import { useStore } from '@nanostores/react';
import { $dashboard } from '../../admin/state/dashboard-store';

function fmtNum(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('ko-KR');
}

export function CdFinance() {
  const s = useStore($dashboard);
  const fin = s.finance;

  if (!fin?.has_data || !fin.rows || !fin.rows.length) {
    return (
      <div style={{ color: '#8b95a1' }}>
        재무 데이터 없음. 편집 → 버튼으로 추가하거나 PDF 업로드 후 Claude에게 처리 요청.
      </div>
    );
  }

  return (
    <>
      {fin.rows.map((r, idx) => {
        const parts: string[] = [];
        if (r.revenue != null) parts.push(`매출 ${fmtNum(r.revenue)}`);
        if (r.vat_payable != null) parts.push(`부가세 ${fmtNum(r.vat_payable)}`);
        return (
          <div key={`${r.period || idx}`} style={{ padding: '6px 0', borderBottom: '1px dashed #e5e8eb' }}>
            <b>{r.period || '-'}</b> {parts.join(' · ')}
          </div>
        );
      })}
      <div style={{ fontSize: '.72em', color: '#8b95a1', marginTop: '6px' }}>최근 3건 (편집 → 버튼)</div>
    </>
  );
}
