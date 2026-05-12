/**
 * Phase Next-Day28 (2026-05-11): 거래처 dashboard — customer.dashboard tRPC 호출.
 * 사장님 명령: 거래처 dashboard 빈 채로 안 보이는 문제 fix.
 *
 * 데이터 흐름:
 *   1. customer.dashboard({userId}) → 9개 데이터 한 번에 fetch (Promise.all in tRPC)
 *   2. setDashboardLoaded({ userId, user, mappedBusinesses, docCounts, ... })
 *   3. 9개 React 컴포넌트가 자동 reactive (nanostores $dashboard)
 */
'use client';

import { useEffect, use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import {
  $dashboard,
  setDashboardLoading,
  setDashboardLoaded,
  setDashboardError,
  closeDashboard,
} from '@/state/dashboard-store';
import { useStore } from '@nanostores/react';
import { CdName, CdSub, CdPriority } from '@/components/cd/CdHeader';
import { CdBasic } from '@/components/cd/CdBasic';
import { CdMemoList } from '@/components/cd/CdMemoList';
import { CdDocs } from '@/components/cd/CdDocs';
import { CdFinance } from '@/components/cd/CdFinance';
import { CdBizDocs } from '@/components/cd/CdBizDocs';
import { CdRecentChat } from '@/components/cd/CdRecentChat';
import { CdTodos, CdSummaries } from '@/components/cd/CdTodosAndSummaries';
import { CdFilings } from '@/components/cd/CdFilings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { User2, StickyNote, FileText, Wallet, Building2, MessageSquare, AlarmClock, ScrollText, ClipboardList, ArrowLeft } from 'lucide-react';

export default function CustomerDashboardPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId: userIdStr } = use(params);
  const userId = parseInt(userIdStr, 10);

  const { data, isLoading, error } = useQuery({
    queryKey: ['customer.dashboard', userId],
    queryFn: () => trpcCall<{
      user: any;
      mappedBusinesses: any[];
      docCounts: Record<string, number>;
      finance: { has_data: boolean; rows: any[] };
      bizDocs: any[];
      memos: any[];
      rooms: any[];
      todos: any[];
      summaries: any[];
      priority: number;
      recentRoom: any;
    }>('customer.dashboard', { userId }),
    enabled: Number.isFinite(userId),
  });

  /* tRPC 응답 → nanostores $dashboard 갱신 */
  useEffect(() => {
    if (!Number.isFinite(userId)) return;
    setDashboardLoading(userId);
    return () => closeDashboard();
  }, [userId]);

  useEffect(() => {
    if (!data || !data.user) return;
    setDashboardLoaded({
      userId,
      user: data.user,
      mappedBusinesses: data.mappedBusinesses,
      docCounts: data.docCounts,
      finance: data.finance,
      priority: data.priority,
      summaries: data.summaries,
      recentRoom: data.recentRoom,
    });
  }, [data, userId]);

  useEffect(() => {
    if (error) setDashboardError((error as Error).message);
  }, [error]);

  return (
    <div className="p-4 space-y-3 max-w-7xl mx-auto">
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">
                  {isLoading ? <Skeleton className="h-5 w-24 inline-block" /> : <CdName />}
                </h1>
                <CdPriority />
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                {isLoading ? <Skeleton className="h-3 w-48" /> : <CdSub />}
              </p>
            </div>
            <Link href="/admin/users">
              <Button size="sm" variant="outline">
                <ArrowLeft size={12} strokeWidth={2} className="mr-1" />
                목록
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <DashboardError />

      {/* 9 섹션 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <DashboardCard icon={User2} title="기본 정보"><CdBasic /></DashboardCard>
        <DashboardCard icon={StickyNote} title="메모"><CdMemoList /></DashboardCard>
        <DashboardCard icon={FileText} title="문서"><CdDocs /></DashboardCard>
        <DashboardCard icon={Wallet} title="재무"><CdFinance /></DashboardCard>
        <DashboardCard icon={Building2} title="사업장 문서"><CdBizDocs /></DashboardCard>
        <DashboardCard icon={MessageSquare} title="최근 대화"><CdRecentChat /></DashboardCard>
        <DashboardCard icon={AlarmClock} title="일정"><CdTodos /></DashboardCard>
        <DashboardCard icon={ScrollText} title="자동 요약"><CdSummaries /></DashboardCard>
        <DashboardCard icon={ClipboardList} title="신고"><CdFilings /></DashboardCard>
      </div>
    </div>
  );
}

function DashboardCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <Icon size={12} strokeWidth={2} className="text-brand-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DashboardError() {
  const s = useStore($dashboard);
  if (!s.error) return null;
  return (
    <Card className="bg-red-50 border-red-200">
      <CardContent className="py-2 px-3">
        <p className="text-xs text-red-700">❌ {s.error}</p>
      </CardContent>
    </Card>
  );
}
