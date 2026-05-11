/** Phase Next-Day28 (2026-05-11): /admin/internal React Query. */
'use client';

import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Lock } from 'lucide-react';

export default function InternalPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['rooms.list', 'internal'],
    queryFn: () => trpcCall<{ rooms: { id: string; name: string | null }[] }>('rooms.list', { internal: true }),
  });
  const rooms = data?.rooms || [];

  return (
    <div className="p-4 space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Lock size={18} strokeWidth={2} className="text-brand-primary" />관리자방
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">모든 admin 자동 초대</p>
      </header>

      <Card>
        <CardContent className="px-0">
          {isLoading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="px-3 py-2"><Skeleton className="h-8 w-full" /></div>)}
          {!isLoading && rooms.length === 0 && <EmptyState icon={<Lock size={32} strokeWidth={1.5} />} title="관리자방이 없습니다" />}
          {!isLoading && rooms.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {rooms.map((r) => (
                <li key={r.id} className="px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors">
                  <p className="text-xs font-medium">{r.name || `방 ${r.id}`}</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">{r.id}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
