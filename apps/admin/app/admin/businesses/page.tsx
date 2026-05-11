/**
 * Phase Next-Day28 (2026-05-11): /admin/businesses — shadcn/ui.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

interface Business {
  id: number;
  company_name: string | null;
  business_number: string | null;
  ceo_name: string | null;
  status: string | null;
  parent_business_id: number | null;
  business_type?: string | null;
  industry?: string | null;
}

const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '활성' },
  { key: 'closed', label: '종료' },
  { key: 'terminated', label: '이관' },
];

export default function BusinessesPage() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Business[]>([]);
  const [counts, setCounts] = useState({ all: 0, active: 0, closed: 0, terminated: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    trpcCall<{ businesses: Business[]; counts: typeof counts }>('businesses.list', {
      status: status as 'all' | 'active' | 'closed' | 'terminated',
      search,
      limit: 200,
    })
      .then((data) => {
        if (!cancelled) {
          setList(data.businesses);
          setCounts(data.counts);
        }
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
          <h1 className="text-lg font-bold text-gray-900">업체</h1>
          <p className="text-xs text-gray-500 mt-0.5">기장 거래처 사업장 + 지점</p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 업체명·사업자번호·대표자"
            className="w-72"
          />
          <Button variant="success" size="sm">
            + 새 업체
          </Button>
        </div>
      </header>

      {/* status tabs with counts */}
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="ml-1 opacity-70">{(counts as Record<string, number>)[t.key] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* table */}
      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs flex items-center justify-between">
            <span>업체 목록</span>
            {!loading && list.length > 0 && (
              <Badge variant="default">총 {list.length} 건</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading && <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>}
          {!loading && list.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-xs">등록된 업체가 없습니다.</p>
          )}
          {!loading && list.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>업체명</TableHead>
                  <TableHead className="w-32">사업자번호</TableHead>
                  <TableHead className="w-20">대표자</TableHead>
                  <TableHead className="w-24">업종</TableHead>
                  <TableHead className="w-20">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((b) => {
                  const isBranch = !!b.parent_business_id;
                  return (
                    <TableRow key={b.id} className={isBranch ? 'bg-blue-50/30' : ''}>
                      <TableCell className="text-gray-400 font-mono">{b.id}</TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/businesses/${b.id}`}
                          className="font-medium hover:text-brand-primary inline-flex items-center gap-1"
                        >
                          <span>{isBranch ? '📍' : '🏢'}</span>
                          {b.company_name || '(이름없음)'}
                          {isBranch && (
                            <Badge variant="primary" className="ml-1">
                              지점
                            </Badge>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-gray-700">
                        {b.business_number || '-'}
                      </TableCell>
                      <TableCell className="text-gray-700">{b.ceo_name || '-'}</TableCell>
                      <TableCell className="text-gray-600 truncate max-w-[120px]">
                        {b.business_type || b.industry || '-'}
                      </TableCell>
                      <TableCell>
                        {b.status === 'closed' && (
                          <Badge variant="default">📦 종료</Badge>
                        )}
                        {b.status === 'terminated' && (
                          <Badge variant="danger">🚫 이관</Badge>
                        )}
                        {(!b.status || b.status === 'active') && (
                          <Badge variant="success">✓ 활성</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
