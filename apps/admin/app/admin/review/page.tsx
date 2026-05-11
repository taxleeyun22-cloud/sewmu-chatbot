/** Phase Next-Day28 (2026-05-11): /admin/review React Query. */
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, AlertTriangle, Flag } from 'lucide-react';

interface ReviewItem {
  id: number; session_id: string | null; user_id: number | null; created_at: string | null;
  content: string | null; confidence: string | null; reviewed: number | null;
  reported: number | null; user_name: string | null; user_real_name: string | null;
  provider: string | null; question: string | null;
}

const FILTERS = [
  { key: 'pending' as const, label: '🔍 검토 대기' },
  { key: 'low' as const, label: '🔴 신뢰도 낮음' },
  { key: 'medium' as const, label: '🟡 신뢰도 보통' },
  { key: 'reported' as const, label: '🚨 신고됨' },
  { key: 'all' as const, label: '전체' },
];

const CONF_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = { 높음: 'success', 보통: 'warning', 낮음: 'danger' };

export default function ReviewPage() {
  const [filter, setFilter] = useState<'pending' | 'low' | 'medium' | 'reported' | 'all'>('pending');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['review.list', filter],
    queryFn: () => trpcCall<{ items: ReviewItem[] }>('review.list', { filter, limit: 100 }),
  });
  const items = data?.items || [];

  const reviewedM = useMutation({
    mutationFn: (id: number) => trpcCall('review.markReviewed', { id }),
    onSuccess: () => { toast.success('검토 완료'); qc.invalidateQueries({ queryKey: ['review.list'] }); qc.invalidateQueries({ queryKey: ['dashboard.counts'] }); },
  });
  const reportM = useMutation({
    mutationFn: (id: number) => trpcCall('review.report', { id }),
    onSuccess: () => { toast.info('신고됨'); qc.invalidateQueries({ queryKey: ['review.list'] }); },
  });
  const confM = useMutation({
    mutationFn: ({ id, confidence }: { id: number; confidence: '높음' | '보통' | '낮음' }) =>
      trpcCall('review.setConfidence', { id, confidence }),
    onSuccess: () => { toast.success('신뢰도 변경'); qc.invalidateQueries({ queryKey: ['review.list'] }); },
  });

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle2 size={18} strokeWidth={2} className="text-brand-primary" />AI 답변 검증
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">자동 검증 파이프라인 → flagged-items.json</p>
        </div>
        <span className="text-[11px] text-gray-500">{isLoading ? '...' : `${items.length}건`}</span>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>{FILTERS.map((f) => <TabsTrigger key={f.key} value={f.key}>{f.label}</TabsTrigger>)}</TabsList>
      </Tabs>

      <div className="space-y-2">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="py-2.5"><Skeleton className="h-24 w-full" /></CardContent></Card>
        ))}
        {!isLoading && items.length === 0 && (
          <Card><CardContent className="py-8"><EmptyState icon="✨" title="검증 대기 답변이 없습니다" /></CardContent></Card>
        )}
        {!isLoading && items.map((item) => (
          <Card key={item.id}>
            <CardContent className="py-2.5 px-3">
              <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1.5 flex-wrap">
                <span className="font-medium text-gray-700">{item.user_real_name || item.user_name || '비로그인'}</span>
                <span>·</span>
                <span className="font-mono">{item.created_at?.slice(2, 16) || '-'}</span>
                {item.confidence && <Badge variant={CONF_VARIANT[item.confidence] || 'default'}>{item.confidence}</Badge>}
                {item.reported === 1 && <Badge variant="danger"><Flag size={9} strokeWidth={2} className="mr-0.5" />신고됨</Badge>}
              </div>
              {item.question && (
                <div className="mt-1.5">
                  <p className="text-[10px] font-medium text-gray-500">❓ 질문</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-1.5 leading-snug">{item.question}</p>
                </div>
              )}
              <div className="mt-1.5">
                <p className="text-[10px] font-medium text-gray-500">💬 AI 답변</p>
                <p className="text-xs text-gray-800 whitespace-pre-wrap bg-blue-50 rounded p-1.5 leading-snug">{item.content || '(빈 답변)'}</p>
              </div>
              <div className="flex gap-1 flex-wrap items-center mt-2">
                <Button size="xs" variant="success" onClick={() => reviewedM.mutate(item.id)}>
                  <CheckCircle2 size={10} strokeWidth={2} className="mr-0.5" />검토완료
                </Button>
                <Button size="xs" variant="destructive" onClick={() => reportM.mutate(item.id)} disabled={item.reported === 1}>
                  <AlertTriangle size={10} strokeWidth={2} className="mr-0.5" />수정필요
                </Button>
                <span className="text-[10px] text-gray-500 ml-1">신뢰도:</span>
                {(['높음', '보통', '낮음'] as const).map((c) => (
                  <Button key={c} size="xs" variant={item.confidence === c ? 'secondary' : 'outline'}
                    onClick={() => confM.mutate({ id: item.id, confidence: c })} disabled={item.confidence === c}>{c}</Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
