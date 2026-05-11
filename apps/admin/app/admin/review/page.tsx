/**
 * Phase Next-Day28 (2026-05-11): /admin/review — shadcn/ui.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ReviewItem {
  id: number;
  session_id: string | null;
  user_id: number | null;
  created_at: string | null;
  content: string | null;
  confidence: string | null;
  reviewed: number | null;
  reported: number | null;
  user_name: string | null;
  user_real_name: string | null;
  provider: string | null;
  question: string | null;
}

const FILTERS = [
  { key: 'pending' as const, label: '🔍 검토 대기' },
  { key: 'low' as const, label: '🔴 신뢰도 낮음' },
  { key: 'medium' as const, label: '🟡 신뢰도 보통' },
  { key: 'reported' as const, label: '🚨 신고됨' },
  { key: 'all' as const, label: '전체' },
];

const CONF_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  높음: 'success',
  보통: 'warning',
  낮음: 'danger',
};

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'low' | 'medium' | 'reported' | 'all'>(
    'pending',
  );

  function refetch() {
    setLoading(true);
    trpcCall<{ items: ReviewItem[] }>('review.list', { filter, limit: 100 })
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refetch();
  }, [filter]);

  async function markReviewed(id: number) {
    await trpcCall('review.markReviewed', { id });
    setItems((items) => items.filter((i) => i.id !== id));
  }

  async function report(id: number) {
    await trpcCall('review.report', { id });
    setItems((items) =>
      items.map((i) => (i.id === id ? { ...i, reported: 1, reviewed: 0 } : i)),
    );
  }

  async function setConfidence(id: number, confidence: '높음' | '보통' | '낮음') {
    await trpcCall('review.setConfidence', { id, confidence });
    setItems((items) =>
      items.map((i) =>
        i.id === id
          ? {
              ...i,
              confidence,
              reviewed: confidence === '높음' ? i.reviewed : 0,
              reported: confidence === '높음' ? i.reported : 1,
            }
          : i,
      ),
    );
  }

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">✓ AI 답변 검증</h1>
          <p className="text-xs text-gray-500 mt-0.5">자동 검증 파이프라인 → flagged-items.json</p>
        </div>
        <span className="text-[11px] text-gray-500">
          {loading ? '불러오는 중...' : `${items.length}건`}
        </span>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.key} value={f.key}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {!loading && items.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-400 text-xs">
              검증 대기 답변이 없습니다 ✨
            </CardContent>
          </Card>
        )}

        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="py-2.5 px-3">
              <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-gray-500">
                <span className="font-medium text-gray-700">
                  {item.user_real_name || item.user_name || '비로그인'}
                </span>
                <span>·</span>
                <span className="font-mono">{item.created_at?.slice(2, 16) || '-'}</span>
                {item.confidence && (
                  <Badge variant={CONF_VARIANT[item.confidence] || 'default'}>
                    {item.confidence}
                  </Badge>
                )}
                {item.reported === 1 && <Badge variant="danger">🚨 신고됨</Badge>}
              </div>

              {item.question && (
                <div className="mt-1.5">
                  <p className="text-[10px] font-medium text-gray-500">❓ 질문</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-1.5 leading-snug">
                    {item.question}
                  </p>
                </div>
              )}

              <div className="mt-1.5">
                <p className="text-[10px] font-medium text-gray-500">💬 AI 답변</p>
                <p className="text-xs text-gray-800 whitespace-pre-wrap bg-blue-50 rounded p-1.5 leading-snug">
                  {item.content || '(빈 답변)'}
                </p>
              </div>

              <div className="flex gap-1 flex-wrap items-center mt-2">
                <Button size="xs" variant="success" onClick={() => markReviewed(item.id)}>
                  ✓검토완료
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() => report(item.id)}
                  disabled={item.reported === 1}
                >
                  🚨수정필요
                </Button>
                <span className="text-[10px] text-gray-500 ml-1">신뢰도:</span>
                {(['높음', '보통', '낮음'] as const).map((c) => (
                  <Button
                    key={c}
                    size="xs"
                    variant={item.confidence === c ? 'secondary' : 'outline'}
                    onClick={() => setConfidence(item.id, c)}
                    disabled={item.confidence === c}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
