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
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-base font-bold text-gray-900">🐞 에러 로그</h1>
        <span className="text-[11px] text-gray-500">
          {loading ? '불러오는 중...' : `${errors.length}건`}
        </span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 px-2 py-1.5 mb-2 flex gap-2 flex-wrap items-center text-xs">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          해결됨 포함
        </label>
        <label className="flex items-center gap-1">
          기간:
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-1.5 py-0.5 border border-gray-200 rounded text-xs"
          >
            <option value={7}>7일</option>
            <option value={30}>30일</option>
            <option value={90}>90일</option>
          </select>
        </label>
        <div className="ml-auto flex gap-1">
          <button
            onClick={clearOld}
            className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            🗑️ {days}일 지난 거
          </button>
          <button
            onClick={clearAll}
            className="text-[11px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            🗑️ 전체 (owner)
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {!loading && errors.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400 text-xs">
            🎉 에러 0건 — 시스템 정상
          </div>
        )}
        {errors.map((e) => (
          <div key={e.id} className="bg-white rounded-lg border border-gray-200 px-2 py-1.5">
            <div className="flex items-start gap-1.5">
              <button
                onClick={() => toggleExpand(e.id)}
                className="text-gray-400 hover:text-gray-700 text-xs"
              >
                {expanded.has(e.id) ? '▼' : '▶'}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap text-[10px]">
                  <span
                    className={`px-1 py-0 rounded ${
                      SOURCE_COLOR[e.source] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {e.source}
                  </span>
                  <span className="text-gray-500 font-mono">
                    {e.created_at?.slice(2, 16)}
                  </span>
                  {e.user_id && <span className="text-gray-500">user #{e.user_id}</span>}
                  {e.resolved === 1 && (
                    <span className="px-1 py-0 rounded bg-green-100 text-green-700">
                      ✓ 해결됨
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-gray-900 break-all leading-tight mt-0.5">
                  {e.message}
                </p>
                {e.url && (
                  <p className="text-[10px] text-gray-500 truncate">📍 {e.url}</p>
                )}
                {expanded.has(e.id) && (
                  <div className="mt-1.5 space-y-1 text-[11px]">
                    {e.stack && (
                      <details open>
                        <summary className="cursor-pointer font-medium text-gray-700">
                          Stack
                        </summary>
                        <pre className="mt-0.5 bg-gray-50 p-1.5 rounded overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">
                          {e.stack}
                        </pre>
                      </details>
                    )}
                    {e.user_agent && (
                      <div className="text-gray-500 truncate">UA: {e.user_agent}</div>
                    )}
                    {e.context && (
                      <details>
                        <summary className="cursor-pointer font-medium text-gray-700">
                          Context
                        </summary>
                        <pre className="mt-0.5 bg-gray-50 p-1.5 rounded overflow-auto font-mono text-[10px]">
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
                  className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded hover:opacity-90 flex-shrink-0"
                >
                  ✓해결
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
