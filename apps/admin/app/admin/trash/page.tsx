/**
 * Phase Next-Day9 (2026-05-09): /admin/trash 본격.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

interface Memo {
  id: number;
  content: string;
  category: string | null;
  deleted_at: string | null;
}

export default function TrashPage() {
  const [list, setList] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const d = await trpcCall<{ memos: Memo[] }>('memos.list', {
      scope: 'trash_list',
      limit: 200,
    });
    setList(d.memos || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function restore(id: number) {
    await trpcCall('memos.restore', { id });
    load();
  }

  async function purge(id: number) {
    if (!confirm('영구 삭제? 되돌릴 수 없음.')) return;
    await trpcCall('memos.purge', { id });
    load();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">🗑️ 휴지통</h1>
      <div className="bg-white rounded-2xl p-6">
        {loading && <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>}
        {!loading && list.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">휴지통이 비어있습니다.</p>
        )}
        {!loading && list.length > 0 && (
          <ul className="space-y-2">
            {list.map((m) => (
              <li key={m.id} className="p-3 border border-gray-200 rounded-xl flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm">{m.content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {m.category && `[${m.category}] `}
                    삭제: {m.deleted_at?.slice(0, 16)}
                  </p>
                </div>
                <button
                  onClick={() => restore(m.id)}
                  className="text-xs bg-green-500 text-white px-3 py-1 rounded"
                >
                  ↻ 복원
                </button>
                <button
                  onClick={() => purge(m.id)}
                  className="text-xs bg-red-500 text-white px-3 py-1 rounded"
                >
                  ✕ 영구
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
