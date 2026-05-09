/**
 * Phase Next-Day7 (2026-05-09): /admin/memos (tRPC 본격).
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

interface Memo {
  id: number;
  content: string;
  category: string | null;
  due_date: string | null;
  is_checked: number | null;
  author_name: string | null;
  created_at: string | null;
  tags: string | null;
}

const CATEGORIES = [
  { key: '', label: '전체' },
  { key: '할 일', label: '📌 할 일' },
  { key: '전화', label: '📞 전화' },
  { key: '문서', label: '📁 문서' },
  { key: '이슈', label: '⚠️ 이슈' },
  { key: '약속', label: '📅 약속' },
  { key: '일반', label: '📝 일반' },
];

export default function MemosPage() {
  const [category, setCategory] = useState('');
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    trpcCall<{ memos: Memo[] }>('memos.list', {
      scope: 'my',
      category: category || undefined,
      limit: 200,
    })
      .then((d) => {
        if (!cancelled) setMemos(d.memos || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">메모</h1>
        <button className="bg-brand-primary text-white px-4 py-2 rounded-lg font-medium">
          + 빠른 메모
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              category === c.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6">
        {loading && <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>}
        {!loading && memos.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">메모 없음</p>
        )}
        {!loading && memos.length > 0 && (
          <ul className="space-y-3">
            {memos.map((m) => (
              <li
                key={m.id}
                className="p-4 border border-gray-200 rounded-xl hover:border-brand-primary"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={m.is_checked === 1}
                    onChange={() => {}}
                    className="mt-1 w-4 h-4 accent-brand-primary"
                  />
                  <div className="flex-1">
                    <p className="text-sm whitespace-pre-wrap">
                      {m.content}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {m.category && `[${m.category}] `}
                      {m.due_date && `📅 ${m.due_date} `}
                      {m.author_name && `· ${m.author_name}`}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
