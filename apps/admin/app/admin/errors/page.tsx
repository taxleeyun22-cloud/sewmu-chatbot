/** Phase Next-Day28 (2026-05-11): /admin/errors React Query. */
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Bug, Trash2, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface ErrorLog {
  id: number; source: string; user_id: number | null; message: string;
  stack: string | null; url: string | null; user_agent: string | null;
  context: string | null; resolved: number | null; resolved_at: string | null;
  created_at: string | null;
}

const SOURCE_VARIANT: Record<string, 'primary' | 'success' | 'secondary' | 'warning' | 'danger'> = {
  admin: 'primary', customer: 'success', business: 'secondary', office: 'warning', chat: 'danger',
};

export default function ErrorsPage() {
  const [showResolved, setShowResolved] = useState(false);
  const [days, setDays] = useState(7);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['errorLogs.list', showResolved, days],
    queryFn: () => trpcCall<{ errors: ErrorLog[] }>('errorLogs.list', {
      resolved: showResolved ? undefined : false, days, limit: 200,
    }),
  });

  const errors = data?.errors || [];

  const resolveM = useMutation({
    mutationFn: (id: number) => trpcCall('errorLogs.resolve', { id }),
    onSuccess: () => { toast.success('해결됨'); qc.invalidateQueries({ queryKey: ['errorLogs.list'] }); },
  });

  const clearOldM = useMutation({
    mutationFn: () => trpcCall<{ deleted: number }>('errorLogs.clearOld', { days }),
    onSuccess: (r) => { toast.success(`삭제 ${r.deleted}건`); qc.invalidateQueries({ queryKey: ['errorLogs.list'] }); },
  });

  const clearAllM = useMutation({
    mutationFn: () => trpcCall('errorLogs.clearAll'),
    onSuccess: () => { toast.success('전체 삭제 완료'); qc.invalidateQueries({ queryKey: ['errorLogs.list'] }); },
  });

  function toggleExpand(id: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Bug size={18} strokeWidth={2} className="text-brand-primary" />에러 로그
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">옵션 A: 사장님 명령 받을 때만 분석</p>
        </div>
        <span className="text-[11px] text-gray-500">{isLoading ? '...' : `${errors.length}건`}</span>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 text-xs py-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="w-3.5 h-3.5" />
            해결됨 포함
          </label>
          <label className="flex items-center gap-1">
            기간:
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-1.5 py-0.5 border border-gray-200 rounded text-xs">
              <option value={7}>7일</option><option value={30}>30일</option><option value={90}>90일</option>
            </select>
          </label>
          <div className="ml-auto flex gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => { if (confirm(`${days}일 지난 항목 모두 삭제?`)) clearOldM.mutate(); }}>
              <Trash2 size={10} strokeWidth={2} className="mr-0.5" />{days}일 지난 거
            </Button>
            <Button size="xs" variant="destructive" onClick={() => { if (confirm('⚠️ 전체 에러 로그를 모두 삭제?') && confirm('한 번 더 확인')) clearAllM.mutate(); }}>
              <Trash2 size={10} strokeWidth={2} className="mr-0.5" />전체 비우기 (owner)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="py-2"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
        {!isLoading && errors.length === 0 && (
          <Card><CardContent className="py-6"><EmptyState icon="🎉" title="에러 0건 — 시스템 정상" /></CardContent></Card>
        )}
        {!isLoading && errors.map((e) => (
          <Card key={e.id}>
            <CardContent className="py-2 px-3">
              <div className="flex items-start gap-2">
                <button onClick={() => toggleExpand(e.id)} className="text-gray-400 hover:text-gray-700 mt-0.5">
                  {expanded.has(e.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap text-[10px]">
                    <Badge variant={SOURCE_VARIANT[e.source] || 'default'}>{e.source}</Badge>
                    <span className="text-gray-500 font-mono">{e.created_at?.slice(2, 16)}</span>
                    {e.user_id && <span className="text-gray-500">user #{e.user_id}</span>}
                    {e.resolved === 1 && <Badge variant="success">✓ 해결됨</Badge>}
                  </div>
                  <p className="font-mono text-xs text-gray-900 break-all leading-tight mt-1">{e.message}</p>
                  {e.url && <p className="text-[10px] text-gray-500 truncate mt-0.5">📍 {e.url}</p>}
                  {expanded.has(e.id) && (
                    <div className="mt-2 space-y-1.5 text-[11px]">
                      {e.stack && <details open><summary className="cursor-pointer font-medium">Stack</summary><pre className="mt-1 bg-gray-50 p-1.5 rounded overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">{e.stack}</pre></details>}
                      {e.user_agent && <div className="text-gray-500 truncate">UA: {e.user_agent}</div>}
                      {e.context && <details><summary className="cursor-pointer font-medium">Context</summary><pre className="mt-1 bg-gray-50 p-1.5 rounded overflow-auto font-mono text-[10px]">{e.context}</pre></details>}
                    </div>
                  )}
                </div>
                {e.resolved !== 1 && (
                  <Button size="xs" variant="success" onClick={() => resolveM.mutate(e.id)}>
                    <Check size={10} strokeWidth={2} className="mr-0.5" />해결
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
