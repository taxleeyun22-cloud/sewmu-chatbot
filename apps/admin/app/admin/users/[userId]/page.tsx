/**
 * Phase Next-Day28 (2026-05-11): 거래처 dashboard 페이지 (shadcn + nanostores + 옛 React 컴포넌트).
 *
 * 사장님 명령 "구글직원처럼 + 50개 쪼개기" — 옛 src/react/components/Cd*.tsx 통합 사용:
 *   - CdHeader / CdBasic / CdMemoList / CdMemoCount / CdDocs / CdFinance /
 *     CdBizDocs / CdRecentChat / CdTodosAndSummaries / CdFilings
 *
 * 데이터 흐름:
 *   1. params.userId → useEffect 에서 trpcCall + fetch 옛 endpoints
 *   2. setDashboardLoaded(payload) → $dashboard store 갱신
 *   3. React 컴포넌트들 자동 reactive
 */
'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
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
import { Badge } from '@/components/ui/badge';

interface User {
  id: number;
  real_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  provider?: string | null;
  approval_status: string | null;
  is_admin: number | null;
  created_at: string | null;
  [key: string]: unknown;
}

export default function CustomerDashboardPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId: userIdStr } = use(params);
  const userId = parseInt(userIdStr, 10);

  useEffect(() => {
    if (!Number.isFinite(userId)) return;
    setDashboardLoading(userId);
    // tRPC users.list 로 user 정보 fetch (단일 user)
    // 또는 옛 /api/admin-approve?user_id=N
    trpcCall<{ users: User[] }>('users.list', { search: '', limit: 200 })
      .then((data) => {
        const user = data.users.find((u) => u.id === userId);
        if (!user) {
          setDashboardError('사용자를 찾을 수 없습니다.');
          return;
        }
        setDashboardLoaded({ userId, user });
      })
      .catch((e) => setDashboardError(e.message));
    return () => {
      closeDashboard();
    };
  }, [userId]);

  return (
    <div className="p-4 space-y-3 max-w-7xl mx-auto">
      {/* 헤더 */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">
                  <CdName />
                </h1>
                <CdPriority />
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                <CdSub />
              </p>
            </div>
            <div className="flex gap-1.5">
              <Link href="/admin/users">
                <Button size="sm" variant="outline">← 목록</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <DashboardError />

      {/* 8 섹션 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>👤</span> 기본 정보
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdBasic />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>📒</span> 메모
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdMemoList />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>📄</span> 문서
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdDocs />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>💰</span> 재무
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdFinance />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>🏢</span> 사업장 문서
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdBizDocs />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>💬</span> 최근 대화
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdRecentChat />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>📋</span> 일정
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdTodos />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>📝</span> 자동 요약
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdSummaries />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <span>📋</span> 신고
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CdFilings />
          </CardContent>
        </Card>
      </div>
    </div>
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
