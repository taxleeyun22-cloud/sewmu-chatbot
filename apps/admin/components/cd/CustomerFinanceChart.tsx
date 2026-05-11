/**
 * Phase #2 (2026-05-07): 거래처 매출·매입·부가세 차트 (Recharts).
 *
 * 거래처 dashboard 안 mount — user_id 받아서 client_finance 데이터 시각화.
 *
 * 사용:
 *   <div id="cust-finance-chart" data-user-id="64"></div>
 *   → react/main.tsx 가 mount.
 */

import { type FC } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useCustomerFinance } from '../hooks/useCustomerFinance';
import type { FinanceRow } from '../hooks/useCustomerFinance';

export interface CustomerFinanceChartProps {
  userId: number;
  height?: number;
}

interface ChartDatum {
  period: string;
  revenue: number;
  cost: number;
  vatPayable: number;
}

function toChartData(rows: FinanceRow[]): ChartDatum[] {
  return rows
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((r) => ({
      period: r.period,
      revenue: Number(r.revenue || 0),
      cost: Number(r.cost || 0),
      vatPayable: Number(r.vat_payable || 0),
    }));
}

function formatKrw(v: number): string {
  if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
}

export const CustomerFinanceChart: FC<CustomerFinanceChartProps> = ({ userId, height = 280 }) => {
  const { rows, loading, error } = useCustomerFinance(userId);

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8b95a1', fontSize: '.85em' }}>
        📊 매출 데이터 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: '#dc2626', fontSize: '.85em' }}>
        오류: {error}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '.85em' }}>
        📊 재무 데이터 없음
        <div style={{ fontSize: '.85em', marginTop: '6px' }}>
          finance_pdfs/{userId}/ 에 PDF 업로드 후 Claude 에 처리 요청
        </div>
      </div>
    );
  }

  const data = toChartData(rows);

  return (
    <div style={{ background: '#fff', borderRadius: '8px', padding: '10px' }}>
      <div style={{ fontSize: '.85em', fontWeight: 700, marginBottom: '8px', color: '#191f28' }}>
        📊 매출 / 매입 / 부가세 추이 ({rows.length}개 기간)
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e8eb" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatKrw} />
          <Tooltip formatter={(v) => formatKrw(Number(v ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" fill="#3182f6" name="매출" />
          <Bar dataKey="cost" fill="#94a3b8" name="매입" />
          <Line type="monotone" dataKey="vatPayable" stroke="#dc2626" name="부가세" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CustomerFinanceChart;
