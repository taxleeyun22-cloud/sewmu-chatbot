/** Phase Next-Day28 (2026-05-11): /admin/search React Query. */
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, User, MessageSquare, StickyNote, Building2 } from 'lucide-react';

interface SearchData {
  users: Array<{ id: number; real_name: string | null; name: string | null; phone: string | null }>;
  rooms: Array<{ id: string; name: string | null }>;
  memos: Array<{ id: number; content: string }>;
  businesses: Array<{ id: number; company_name: string | null }>;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const enabled = query.length >= 2;
  const { data, isLoading } = useQuery({
    queryKey: ['search.global', query],
    queryFn: () => trpcCall<SearchData>('search.global', { query }),
    enabled,
  });

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Search size={18} strokeWidth={2} className="text-brand-primary" />전역 검색
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">사용자 · 상담방 · 메시지 · 메모 · 업체 · 문서</p>
      </header>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="2자 이상 입력하세요..." autoFocus className="h-10 pl-9" />
      </div>

      <Card>
        <CardContent className="py-3">
          {!enabled && <EmptyState icon={<Search size={32} strokeWidth={1.5} />} title="2자 이상 입력하세요" />}
          {enabled && isLoading && <>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-12 w-full mb-3" />
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-12 w-full" />
          </>}
          {enabled && !isLoading && data && (
            (() => {
              const total = data.users.length + data.rooms.length + data.memos.length + data.businesses.length;
              if (total === 0) return <EmptyState title={`"${query}" 결과 없음`} />;
              return (
                <div className="space-y-3">
                  {data.users.length > 0 && (
                    <Section title="사용자" count={data.users.length} icon={User}>
                      {data.users.map((u) => (
                        <div key={u.id} className="text-xs py-1 px-1.5 hover:bg-gray-50 rounded">
                          <span className="font-medium">{u.real_name || u.name || `#${u.id}`}</span>
                          <span className="text-gray-400 font-mono ml-1">{u.phone}</span>
                        </div>
                      ))}
                    </Section>
                  )}
                  {data.rooms.length > 0 && (
                    <Section title="상담방" count={data.rooms.length} icon={MessageSquare}>
                      {data.rooms.map((r) => <div key={r.id} className="text-xs py-1 px-1.5 hover:bg-gray-50 rounded">{r.name || r.id}</div>)}
                    </Section>
                  )}
                  {data.memos.length > 0 && (
                    <Section title="메모" count={data.memos.length} icon={StickyNote}>
                      {data.memos.map((m) => <div key={m.id} className="text-xs py-1 px-1.5 line-clamp-2 hover:bg-gray-50 rounded">{m.content}</div>)}
                    </Section>
                  )}
                  {data.businesses.length > 0 && (
                    <Section title="업체" count={data.businesses.length} icon={Building2}>
                      {data.businesses.map((b) => <div key={b.id} className="text-xs py-1 px-1.5 hover:bg-gray-50 rounded">{b.company_name || `#${b.id}`}</div>)}
                    </Section>
                  )}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, count, icon: Icon, children }: { title: string; count: number; icon: typeof User; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold text-gray-600 uppercase mb-1 flex items-center gap-1.5">
        <Icon size={11} strokeWidth={2} />{title}<Badge variant="default">{count}</Badge>
      </h3>
      <div className="bg-gray-50 rounded-md p-1.5">{children}</div>
    </div>
  );
}
