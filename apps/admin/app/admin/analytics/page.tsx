/**
 * Phase Next-Day28 (2026-05-11): /admin/analytics — shadcn/ui.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="p-4 space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">📈 분석</h1>
        <p className="text-xs text-gray-500 mt-0.5">Day 13+ Recharts 통합 예정</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="대기 사용자" value={counts?.pendingUsers ?? '--'} />
        <Stat label="기장거래처" value={counts?.approvedClients ?? '--'} />
        <Stat label="활성 상담방" value={counts?.activeRooms ?? '--'} />
        <Stat label="임박 일정 (7일)" value={counts?.urgentTodos ?? '--'} />
      </div>

      <Card>
        <CardContent className="py-4 text-xs text-gray-500">
          Day 13+ — Recharts 월별/일별 통계 + 거래처 활동 분석 + 챗봇 신뢰도 분포
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-2">
        <p className="text-[10px] text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
