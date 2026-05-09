/**
 * Phase Next-Day26 (2026-05-09): /admin/errors — 자체 에러 로그 (🐞 무당벌레).
 *
 * CLAUDE.md "🐞 옵션 A 룰":
 * - 사장님 명령 받을 때만 분석
 * - "에러 봐봐" / "무당벌레 분석" 시 진입
 * - 7일 지난 거 / 전체 비우기
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

interface ErrorLog {
  id: number;
  source: string;
  user_id: number | null;
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  context: string | null;
  resolved: number | null;
  resolved_at: string | null;
  created_at: string | null;
}

const SOURCE_COLOR: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700',
  customer: 'bg-green-100 text-green-700',
  business: 'bg-purple-100 text-purple-700',
  office: 'bg-yellow-100 text-yellow-700',
  chat: 'bg-pink-100 text-pink-700',
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [days, setDays] = useState(7);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function refetch() {
    setLoading(true);
    trpcCall<{ errors: ErrorLog[] }>('errorLogs.list', {
      resolved: showResolved ? undefined : false,
      days,
      limit: 200,
    })
      .then((d) => setErrors(d.errors || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResolved, days]);

  async function resolve(id: number) {
    await trpcCall('errorLogs.resolve', { id });
    setErrors((es) => es.filter((e) => e.id !== id));
  }

  async function clearOld() {
    if (!confirm(`${days}일 지난 항목 모두 삭제할까요?`)) return;
    const r = await trpcCall<{ deleted: number }>('errorLogs.clearOld', { days });
    alert(`삭제 ${r.deleted}건`);
    refetch();
  }

  async function clearAll() {
    if (!confirm('⚠️ 전체 에러 로그를 모두 삭제합니다. 되돌릴 수 없습니다. 진행할까요?')) {
      return;
    }
    if (!confirm('정말 전체 비우시겠습니까? (한 번 더 확인)')) return;
    await trpcCall('errorLogs.clearAll');
    alert('전체 삭제 완료');
    refetch();
  }

  function toggleExpand(id: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🐞 에러 로그</h1>
        <span className="text-sm text-gray-500">
          {loading ? '불러오는 중...' : `${errors.length}건`}
        </span>
      </div>

      <div className="bg-white rounded-2xl p-4 mb-4 flex gap-3 flex-wrap items-center">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          해결된 것 포함
        </label>
        <label className="text-sm">
          기간:
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-2 px-2 py-1 border border-gray-200 rounded-lg text-sm"
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <button
            onClick={clearOld}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            🗑️ {days}일 지난 거
          </button>
          <button
            onClick={clearAll}
            className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
          >
            🗑️ 전체 비우기 (owner)
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {!loading && errors.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400 text-sm">
            🎉 에러 0건 — 시스템 정상
          </div>
        )}
        {errors.map((e) => (
          <div key={e.id} className="bg-white rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <button
                onClick={() => toggleExpand(e.id)}
                className="text-gray-400 hover:text-gray-700 px-1"
              >
                {expanded.has(e.id) ? '▼' : '▶'}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      SOURCE_COLOR[e.source] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {e.source}
                  </span>
                  <span className="text-xs text-gray-500">
                    {e.created_at?.slice(0, 16)}
                  </span>
                  {e.user_id && (
                    <span className="text-xs text-gray-500">user #{e.user_id}</span>
                  )}
                  {e.resolved === 1 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      ✓ 해결됨
                    </span>
                  )}
                </div>
                <p className="font-mono text-sm text-gray-900 break-all">{e.message}</p>
                {e.url && (
                  <p className="text-xs text-gray-500 mt-1 truncate">📍 {e.url}</p>
                )}
                {expanded.has(e.id) && (
                  <div className="mt-3 space-y-2 text-xs">
                    {e.stack && (
                      <details open>
                        <summary className="cursor-pointer font-medium text-gray-700">
                          Stack
                        </summary>
                        <pre className="mt-1 bg-gray-50 p-2 rounded overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                          {e.stack}
                        </pre>
                      </details>
                    )}
                    {e.user_agent && (
                      <div className="text-gray-500">UA: {e.user_agent}</div>
                    )}
                    {e.context && (
                      <details>
                        <summary className="cursor-pointer font-medium text-gray-700">
                          Context
                        </summary>
                        <pre className="mt-1 bg-gray-50 p-2 rounded overflow-auto font-mono text-[11px]">
                          {e.context}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
              {e.resolved !== 1 && (
                <button
                  onClick={() => resolve(e.id)}
                  className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:opacity-90 flex-shrink-0"
                >
                  ✓ 해결
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
