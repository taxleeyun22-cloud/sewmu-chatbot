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
    <div className="p-3 max-w-3xl mx-auto">
      <h1 className="text-base font-bold text-gray-900 mb-2">🗑️ 휴지통</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>}
        {!loading && list.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-xs">휴지통이 비어있습니다.</p>
        )}
        {!loading && list.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {list.map((m) => (
              <li key={m.id} className="px-2 py-1.5 flex items-center gap-1.5 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug truncate">{m.content}</p>
                  <p className="text-[10px] text-gray-400">
                    {m.category && (
                      <span className="bg-gray-100 px-1 py-0 rounded mr-1">{m.category}</span>
                    )}
                    삭제: {m.deleted_at?.slice(0, 16)}
                  </p>
                </div>
                <button
                  onClick={() => restore(m.id)}
                  className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded"
                >
                  ↻복원
                </button>
                <button
                  onClick={() => purge(m.id)}
                  className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded"
                >
                  ✕영구
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
