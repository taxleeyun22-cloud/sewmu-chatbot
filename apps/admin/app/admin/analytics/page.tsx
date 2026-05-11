/** Phase Next-Day28 (2026-05-11): /admin/analytics React Query. */
'use client';

import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Users, Star, MessageSquare, AlarmClock } from 'lucide-react';

interface Counts { pendingUsers: number; approvedClients: number; activeRooms: number; urgentTodos: number; }

export default function AnalyticsPage() {
  const { data: counts, isLoading } = useQuery({
    queryKey: ['dashboard.counts'],
    queryFn: () => trpcCall<Counts>('dashboard.counts'),
  });

  return (
    <div className="p-4 space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={18} strokeWidth={2} className="text-brand-primary" />분석
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Day 13+ Recharts 통합 예정</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="대기 사용자" icon={Users} value={counts?.pendingUsers} loading={isLoading} />
        <Stat label="기장거래처" icon={Star} value={counts?.approvedClients} loading={isLoading} />
        <Stat label="활성 상담방" icon={MessageSquare} value={counts?.activeRooms} loading={isLoading} />
        <Stat label="임박 일정" icon={AlarmClock} value={counts?.urgentTodos} loading={isLoading} />
      </div>

      <Card>
        <CardContent className="py-4 text-xs text-gray-500">
          Day 13+ — Recharts 월별/일별 통계 + 거래처 활동 분석 + 챗봇 신뢰도 분포
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, icon: Icon, value, loading }: { label: string; icon: typeof BarChart3; value: number | undefined; loading: boolean }) {
  return (
    <Card>
      <CardContent className="py-2">
        <Icon size={14} strokeWidth={1.8} className="text-gray-400 mb-1" />
        <p className="text-[10px] text-gray-500">{label}</p>
        {loading ? <Skeleton className="h-6 w-12 mt-0.5" /> : <p className="text-xl font-bold text-gray-900 leading-tight">{value ?? '-'}</p>}
      </CardContent>
    </Card>
  );
}
