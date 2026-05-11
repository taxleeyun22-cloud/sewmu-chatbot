/**
 * Phase Next-Day28 (2026-05-11): /admin/errors — shadcn/ui.
 * CLAUDE.md 옵션 A 룰: 사장님 명령 받을 때만 분석.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

const SOURCE_VARIANT: Record<string, 'primary' | 'success' | 'secondary' | 'warning' | 'danger'> = {
  admin: 'primary',
  customer: 'success',
  business: 'secondary',
  office: 'warning',
  chat: 'danger',
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
    if (!confirm('⚠️ 전체 에러 로그를 모두 삭제합니다. 되돌릴 수 없습니다.')) return;
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
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">🐞 에러 로그</h1>
          <p className="text-xs text-gray-500 mt-0.5">옵션 A: 사장님 명령 받을 때만 분석</p>
        </div>
        <span className="text-[11px] text-gray-500">
          {loading ? '불러오는 중...' : `${errors.length}건`}
        </span>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 text-xs py-2">
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
          <div className="ml-auto flex gap-1.5">
            <Button size="xs" variant="secondary" onClick={clearOld}>
              🗑️ {days}일 지난 거
            </Button>
            <Button size="xs" variant="destructive" onClick={clearAll}>
              🗑️ 전체 비우기 (owner)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        {!loading && errors.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-400 text-xs">
              🎉 에러 0건 — 시스템 정상
            </CardContent>
          </Card>
        )}
        {errors.map((e) => (
          <Card key={e.id}>
            <CardContent className="py-2 px-3">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => toggleExpand(e.id)}
                  className="text-gray-400 hover:text-gray-700 text-xs mt-0.5"
                >
                  {expanded.has(e.id) ? '▼' : '▶'}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant={SOURCE_VARIANT[e.source] || 'default'}>
                      {e.source}
                    </Badge>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {e.created_at?.slice(2, 16)}
                    </span>
                    {e.user_id && (
                      <span className="text-[10px] text-gray-500">user #{e.user_id}</span>
                    )}
                    {e.resolved === 1 && <Badge variant="success">✓ 해결됨</Badge>}
                  </div>
                  <p className="font-mono text-xs text-gray-900 break-all leading-tight mt-1">
                    {e.message}
                  </p>
                  {e.url && (
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">📍 {e.url}</p>
                  )}
                  {expanded.has(e.id) && (
                    <div className="mt-2 space-y-1.5 text-[11px]">
                      {e.stack && (
                        <details open>
                          <summary className="cursor-pointer font-medium text-gray-700">
                            Stack
                          </summary>
                          <pre className="mt-1 bg-gray-50 p-2 rounded overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">
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
                          <pre className="mt-1 bg-gray-50 p-2 rounded overflow-auto font-mono text-[10px]">
                            {e.context}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
                {e.resolved !== 1 && (
                  <Button size="xs" variant="success" onClick={() => resolve(e.id)}>
                    ✓해결
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
