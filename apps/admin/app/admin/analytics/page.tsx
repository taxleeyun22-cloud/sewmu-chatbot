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
    <div className="p-3">
      <h1 className="text-base font-bold text-gray-900 mb-2">📈 분석</h1>

      <div className="grid grid-cols-4 gap-2 mb-2">
        <Stat label="대기 사용자" value={counts?.pendingUsers ?? '--'} />
        <Stat label="기장거래처" value={counts?.approvedClients ?? '--'} />
        <Stat label="활성 상담방" value={counts?.activeRooms ?? '--'} />
        <Stat label="임박 일정 (7일)" value={counts?.urgentTodos ?? '--'} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-xs text-gray-500">
          Day 13+ — Recharts 월별/일별 통계 + 거래처 활동 분석 + 챗봇 신뢰도 분포
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-2 py-1.5">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-lg font-bold leading-tight">{value}</p>
    </div>
  );
}
