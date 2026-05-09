/**
 * Phase Next-Day15 (2026-05-09): /admin/review — AI 답변 검증.
 * CLAUDE.md "🚨 자동 검증 시스템" 룰: flagged-items.json 동기화 → Claude 재검증 사이클.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

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

const FILTERS: { key: 'pending' | 'low' | 'medium' | 'reported' | 'all'; label: string }[] = [
  { key: 'pending', label: '🔍 검토 대기' },
  { key: 'low', label: '🔴 신뢰도 낮음' },
  { key: 'medium', label: '🟡 신뢰도 보통' },
  { key: 'reported', label: '🚨 신고됨' },
  { key: 'all', label: '전체' },
];

const CONF_COLOR: Record<string, string> = {
  높음: 'bg-green-100 text-green-700',
  보통: 'bg-yellow-100 text-yellow-700',
  낮음: 'bg-red-100 text-red-700',
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">✓ AI 답변 검증</h1>
        <span className="text-sm text-gray-500">
          {loading ? '불러오는 중...' : `${items.length}건`}
        </span>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              filter === f.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {!loading && items.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400 text-sm">
            검증 대기 답변이 없습니다 ✨
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl p-5">
            {/* 헤더 */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3 flex-wrap">
              <span className="font-medium">
                {item.user_real_name || item.user_name || '비로그인'}
              </span>
              <span>·</span>
              <span>{item.created_at?.slice(0, 16) || '-'}</span>
              {item.confidence && (
                <span
                  className={`px-2 py-0.5 rounded-full ${
                    CONF_COLOR[item.confidence] || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {item.confidence}
                </span>
              )}
              {item.reported === 1 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  🚨 신고됨
                </span>
              )}
            </div>

            {/* 질문 */}
            {item.question && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-1">❓ 질문</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                  {item.question}
                </p>
              </div>
            )}

            {/* 답변 */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-1">💬 AI 답변</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap bg-blue-50 rounded-lg p-3">
                {item.content || '(빈 답변)'}
              </p>
            </div>

            {/* 액션 */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => markReviewed(item.id)}
                className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:opacity-90"
              >
                ✓ 검토 완료
              </button>
              <button
                onClick={() => report(item.id)}
                className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:opacity-90"
                disabled={item.reported === 1}
              >
                🚨 수정 필요
              </button>
              <div className="border-l border-gray-200 mx-1" />
              <span className="text-xs text-gray-500 self-center">신뢰도:</span>
              {(['높음', '보통', '낮음'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setConfidence(item.id, c)}
                  disabled={item.confidence === c}
                  className={`text-xs px-2 py-1 rounded-lg border ${
                    item.confidence === c
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
