/**
 * Phase Next-Day12 (2026-05-09): /admin/analytics — 통계 대시보드.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

interface Counts {
  pendingUsers: number;
  approvedClients: number;
  activeRooms: number;
  urgentTodos: number;
}

export default function AnalyticsPage() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    trpcCall<Counts>('dashboard.counts').then(setCounts).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📈 분석</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="대기 사용자" value={counts?.pendingUsers ?? '--'} />
        <Stat label="기장거래처" value={counts?.approvedClients ?? '--'} />
        <Stat label="활성 상담방" value={counts?.activeRooms ?? '--'} />
        <Stat label="임박 일정 (7일)" value={counts?.urgentTodos ?? '--'} />
      </div>

      <div className="bg-white rounded-2xl p-6">
        <p className="text-sm text-gray-500">
          Day 13+ — Recharts 월별/일별 통계 + 거래처 활동 분석 + 챗봇 신뢰도 분포
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl p-5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}
