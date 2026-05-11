/**
 * Phase Next-Day28 (2026-05-11): /admin/trash — shadcn/ui.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">🗑️ 휴지통</h1>
        <p className="text-xs text-gray-500 mt-0.5">메모 soft delete · 복원 가능</p>
      </header>

      <Card>
        <CardContent className="px-0">
          {loading && <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>}
          {!loading && list.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-xs">휴지통이 비어있습니다.</p>
          )}
          {!loading && list.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {list.map((m) => (
                <li
                  key={m.id}
                  className="px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug truncate">{m.content}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.category && <Badge variant="default">{m.category}</Badge>}
                      <span className="text-[10px] text-gray-400 font-mono">
                        삭제: {m.deleted_at?.slice(0, 16)}
                      </span>
                    </div>
                  </div>
                  <Button size="xs" variant="success" onClick={() => restore(m.id)}>
                    ↻복원
                  </Button>
                  <Button size="xs" variant="destructive" onClick={() => purge(m.id)}>
                    ✕영구
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
