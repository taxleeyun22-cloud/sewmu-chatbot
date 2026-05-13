/**
 * Phase Next-Day28 (2026-05-11): /admin/users — React Query + Skeleton + lucide.
 * 구글직원 패턴.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { toast } from '@/components/ui/toast';
import { confirm } from '@/components/ui/confirm-dialog';
import { formatUserName } from '@/lib/format';
import { invalidateAfter } from '@/lib/mutation-invalidate';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Star, X, Ban, RotateCcw, Crown, Search } from 'lucide-react';

const STATUS_TABS = [
  { key: 'pending', label: '대기', icon: Users },
  { key: 'approved_client', label: '기장거래처', icon: Star },
  { key: 'rejected', label: '거절', icon: X },
  { key: 'terminated', label: '종료', icon: Ban },
  { key: 'rejoined', label: '재가입', icon: RotateCcw },
  { key: 'admin', label: '관리자', icon: Crown },
];

interface User {
  id: number;
  real_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  approval_status: string | null;
  is_admin: number | null;
  provider?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
}

export default function UsersPage() {
  const [status, setStatus] = useState('pending');
  const [searchRaw, setSearchRaw] = useState('');
  /* Phase 10 cleanup (2026-05-12): 250ms debounce — D1 read 폭주 방지 */
  const search = useDebouncedValue(searchRaw, 250);

  const { data, isLoading, error } = useQuery({
    queryKey: ['users.list', status, search],
    queryFn: () =>
      trpcCall<{ users: User[] }>('users.list', { status, search, limit: 1000 }),
    /* sidebar count 와 같은 데이터 → staleTime 으로 캐시 활용 */
    staleTime: 5_000,
  });

  const users = data?.users || [];
  const ActiveIcon = STATUS_TABS.find((t) => t.key === status)?.icon || Users;
  const activeLabel = STATUS_TABS.find((t) => t.key === status)?.label;

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Users size={18} strokeWidth={2} className="text-brand-primary" />
            사용자
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">거래처 + admin 관리</p>
        </div>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <Input
            type="text"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="이름·전화·이메일 검색"
            className="w-72 pl-8"
            aria-label="사용자 검색"
          />
        </div>
      </header>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {STATUS_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-1">
                <Icon size={12} strokeWidth={1.8} />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ActiveIcon size={12} strokeWidth={2} />
              {activeLabel} 사용자
            </span>
            {!isLoading && users.length > 0 && (
              <Badge variant="default">총 {users.length} 건</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {isLoading && <UsersTableSkeleton />}
          {error && (
            <EmptyState
              icon="⚠️"
              title="불러오기 실패"
              description={(error as Error).message}
            />
          )}
          {!isLoading && !error && users.length === 0 && (
            <EmptyState
              icon={<Users size={32} strokeWidth={1.5} />}
              title="사용자 없음"
              description={`${activeLabel} 상태의 사용자가 없습니다.`}
            />
          )}
          {!isLoading && users.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead className="w-32">연락처</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead className="w-20">로그인</TableHead>
                  <TableHead className="w-24">가입일</TableHead>
                  <TableHead className="w-36 text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <UserRow key={u.id} user={u} status={status} search={search} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({
  user,
  status,
  search,
}: {
  user: User;
  status: string;
  search: string;
}) {
  const queryClient = useQueryClient();
  const setStatusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      trpcCall('users.setStatus', { userId: user.id, status: newStatus }),
    onSuccess: (_, newStatus) => {
      toast.success(`${formatUserName(user)} → ${newStatus}`);
      /* Phase 14: invalidation matrix — users + sidebar 자동 */
      invalidateAfter(queryClient, { users: true });
    },
    onError: (e) => toast.error(`실패: ${(e as Error).message}`),
  });

  /** Phase 11: 브라우저 native `confirm()` → shadcn AlertDialog */
  async function doSetStatus(newStatus: string) {
    const name = formatUserName(user);
    const isDestructive =
      newStatus === 'rejected' || newStatus === 'terminated';
    const ok = await confirm({
      title: `상태 변경: ${name}`,
      description: `${name} 을(를) "${newStatus}" 으로 변경할까요?`,
      confirmText: '변경',
      cancelText: '취소',
      variant: isDestructive ? 'destructive' : 'default',
    });
    if (!ok) return;
    setStatusMutation.mutate(newStatus);
  }

  const providerVariant =
    user.provider === 'kakao' ? 'warning' : user.provider === 'naver' ? 'success' : 'default';

  return (
    <TableRow>
      <TableCell className="text-gray-400 dark:text-gray-500 font-mono">{user.id}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar
            name={user.real_name || user.name || '?'}
            size="xs"
            variant={user.provider === 'kakao' ? 'kakao' : 'primary'}
          />
          <Link
            href={`/admin/users/${user.id}`}
            className="font-medium hover:text-brand-primary hover:underline"
          >
            {user.real_name || user.name || '이름없음'}
          </Link>
          {user.is_admin === 1 && (
            <Badge variant="secondary" className="ml-1">
              <Crown size={9} strokeWidth={2} className="mr-0.5" />
              관리자
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="font-mono text-gray-700 dark:text-gray-200">{user.phone || '-'}</TableCell>
      <TableCell className="text-gray-600 dark:text-gray-300 truncate max-w-[180px]">{user.email || '-'}</TableCell>
      <TableCell>
        <Badge variant={providerVariant}>
          {user.provider === 'kakao'
            ? '카톡'
            : user.provider === 'naver'
              ? '네이버'
              : '수동'}
        </Badge>
      </TableCell>
      {/* Phase 15 audit fix: slice(2,10) hack → formatDate (locale + null safe) */}
      <TableCell className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
        {formatDate(user.created_at)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          {user.approval_status === 'pending' && (
            <>
              <Button
                size="xs"
                onClick={() => doSetStatus('approved_client')}
                disabled={setStatusMutation.isPending}
              >
                <Star size={10} strokeWidth={2} className="mr-0.5" />
                기장
              </Button>
              <Button
                size="xs"
                variant="destructive"
                onClick={() => doSetStatus('rejected')}
                disabled={setStatusMutation.isPending}
              >
                <X size={10} strokeWidth={2} className="mr-0.5" />
                거절
              </Button>
            </>
          )}
          {user.approval_status === 'approved_client' && (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => doSetStatus('terminated')}
              disabled={setStatusMutation.isPending}
            >
              <Ban size={10} strokeWidth={2} className="mr-0.5" />
              종료
            </Button>
          )}
          {user.approval_status === 'rejected' && (
            <Button
              size="xs"
              onClick={() => doSetStatus('approved_client')}
              disabled={setStatusMutation.isPending}
            >
              <RotateCcw size={10} strokeWidth={2} className="mr-0.5" />
              복구
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function UsersTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>이름</TableHead>
          <TableHead className="w-32">연락처</TableHead>
          <TableHead>이메일</TableHead>
          <TableHead className="w-20">로그인</TableHead>
          <TableHead className="w-24">가입일</TableHead>
          <TableHead className="w-36 text-right">액션</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-3 w-6" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-3 w-24" /></TableCell>
            <TableCell><Skeleton className="h-3 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-10 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-3 w-16" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
