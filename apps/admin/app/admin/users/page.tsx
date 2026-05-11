/**
 * Phase Next-Day28 (2026-05-11): /admin/users — shadcn/ui 적용.
 * 사장님 명령 "구글직원처럼 + 모달 팝업 위치까지".
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_TABS = [
  { key: 'pending', label: '대기', emoji: '⏳' },
  { key: 'approved_client', label: '기장거래처', emoji: '⭐' },
  { key: 'rejected', label: '거절', emoji: '✕' },
  { key: 'terminated', label: '종료', emoji: '⛔' },
  { key: 'rejoined', label: '재가입', emoji: '↻' },
  { key: 'admin', label: '관리자', emoji: '👑' },
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
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refetch() {
    setLoading(true);
    setError(null);
    trpcCall<{ users: User[] }>('users.list', { status, search, limit: 200 })
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    trpcCall<{ users: User[] }>('users.list', { status, search, limit: 200 })
      .then((d) => {
        if (!cancelled) setUsers(d.users);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, search]);

  return (
    <div className="p-4 space-y-3">
      {/* 헤더 */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">사용자</h1>
          <p className="text-xs text-gray-500 mt-0.5">거래처 + admin 관리</p>
        </div>
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 이름·전화·이메일 검색"
          className="w-72"
        />
      </header>

      {/* status tabs */}
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              <span className="mr-1">{t.emoji}</span>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* table card */}
      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs flex items-center justify-between">
            <span>
              {STATUS_TABS.find((t) => t.key === status)?.emoji}{' '}
              {STATUS_TABS.find((t) => t.key === status)?.label} 사용자
            </span>
            {!loading && users.length > 0 && (
              <Badge variant="default">총 {users.length} 건</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading && (
            <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>
          )}
          {error && (
            <p className="text-center text-red-500 py-6 text-xs">오류: {error}</p>
          )}
          {!loading && !error && users.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-xs">
              해당 status 의 사용자가 없습니다.
            </p>
          )}
          {!loading && users.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead className="w-32">연락처</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead className="w-20">로그인</TableHead>
                  <TableHead className="w-24">가입일</TableHead>
                  <TableHead className="w-32 text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-gray-400 font-mono">{u.id}</TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {u.real_name || u.name || '이름없음'}
                      </span>
                      {u.is_admin === 1 && (
                        <Badge variant="secondary" className="ml-1.5">
                          👑 관리자
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-gray-700">
                      {u.phone || '-'}
                    </TableCell>
                    <TableCell className="text-gray-600 truncate max-w-[180px]">
                      {u.email || '-'}
                    </TableCell>
                    <TableCell>
                      {u.provider === 'kakao' && <Badge variant="warning">카톡</Badge>}
                      {u.provider === 'naver' && <Badge variant="success">네이버</Badge>}
                      {!u.provider && <Badge variant="default">수동</Badge>}
                    </TableCell>
                    <TableCell className="text-[10px] text-gray-500 font-mono">
                      {u.created_at ? u.created_at.slice(2, 10) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActions user={u} onChanged={refetch} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserActions({ user, onChanged }: { user: User; onChanged: () => void }) {
  async function setUserStatus(status: string) {
    if (!confirm(`${user.real_name || user.name} 을(를) ${status} 으로 변경?`)) return;
    await trpcCall('users.setStatus', { userId: user.id, status });
    onChanged();
  }

  return (
    <div className="flex gap-1 justify-end">
      {user.approval_status === 'pending' && (
        <>
          <Button
            size="xs"
            variant="default"
            onClick={() => setUserStatus('approved_client')}
            title="기장거래처 승급"
          >
            ⭐기장
          </Button>
          <Button
            size="xs"
            variant="destructive"
            onClick={() => setUserStatus('rejected')}
            title="거절"
          >
            ✕거절
          </Button>
        </>
      )}
      {user.approval_status === 'approved_client' && (
        <Button
          size="xs"
          variant="secondary"
          onClick={() => setUserStatus('terminated')}
          title="종료"
        >
          ⛔종료
        </Button>
      )}
      {user.approval_status === 'rejected' && (
        <Button
          size="xs"
          variant="default"
          onClick={() => setUserStatus('approved_client')}
          title="기장거래처 복구"
        >
          ↻복구
        </Button>
      )}
    </div>
  );
}
