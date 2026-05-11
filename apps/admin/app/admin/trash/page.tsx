/** Phase Next-Day28 (2026-05-11): /admin/trash React Query. */
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Trash2, RotateCcw, X } from 'lucide-react';

interface Memo { id: number; content: string; category: string | null; deleted_at: string | null; }

export default function TrashPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['memos.list', 'trash_list'],
    queryFn: () => trpcCall<{ memos: Memo[] }>('memos.list', { scope: 'trash_list', limit: 200 }),
  });
  const list = data?.memos || [];

  const restoreM = useMutation({
    mutationFn: (id: number) => trpcCall('memos.restore', { id }),
    onSuccess: () => { toast.success('복원됨'); qc.invalidateQueries({ queryKey: ['memos.list'] }); },
  });
  const purgeM = useMutation({
    mutationFn: (id: number) => trpcCall('memos.purge', { id }),
    onSuccess: () => { toast.success('영구 삭제됨'); qc.invalidateQueries({ queryKey: ['memos.list'] }); },
  });

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Trash2 size={18} strokeWidth={2} className="text-brand-primary" />휴지통
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">메모 soft delete · 복원 가능</p>
      </header>

      <Card>
        <CardContent className="px-0">
          {isLoading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-3 py-2"><Skeleton className="h-8 w-full" /></div>
          ))}
          {!isLoading && list.length === 0 && (
            <EmptyState icon={<Trash2 size={32} strokeWidth={1.5} />} title="휴지통이 비어있습니다" />
          )}
          {!isLoading && list.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {list.map((m) => (
                <li key={m.id} className="px-3 py-2 flex items-center gap-2 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug truncate">{m.content}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.category && <Badge variant="default">{m.category}</Badge>}
                      <span className="text-[10px] text-gray-400 font-mono">삭제: {m.deleted_at?.slice(0, 16)}</span>
                    </div>
                  </div>
                  <Button size="xs" variant="success" onClick={() => restoreM.mutate(m.id)}>
                    <RotateCcw size={10} strokeWidth={2} className="mr-0.5" />복원
                  </Button>
                  <Button size="xs" variant="destructive" onClick={() => { if (confirm('영구 삭제?')) purgeM.mutate(m.id); }}>
                    <X size={10} strokeWidth={2} className="mr-0.5" />영구
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
