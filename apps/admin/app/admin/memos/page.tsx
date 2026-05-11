/**
 * Phase Next-Day28 (2026-05-11): /admin/memos 컴팩트.
 * 사장님 명령: "새 어드민 컴팩트하게 변동 ㄱㄱ"
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
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-base font-bold text-gray-900">메모</h1>
        <button className="bg-brand-primary text-white px-2.5 py-1 rounded text-xs font-medium">
          + 빠른 메모
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
              category === c.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>}
        {!loading && memos.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-xs">메모 없음</p>
        )}
        {!loading && memos.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {memos.map((m) => (
              <li key={m.id} className="px-2 py-1.5 hover:bg-gray-50">
                <div className="flex items-start gap-1.5">
                  <input
                    type="checkbox"
                    checked={m.is_checked === 1}
                    onChange={() => {}}
                    className="mt-0.5 w-3.5 h-3.5 accent-brand-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs whitespace-pre-wrap leading-snug">{m.content}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {m.category && (
                        <span className="bg-gray-100 px-1 py-0 rounded mr-1">
                          {m.category}
                        </span>
                      )}
                      {m.due_date && <span className="mr-1">📅 {m.due_date}</span>}
                      {m.author_name && <span>· {m.author_name}</span>}
                      {m.created_at && (
                        <span className="ml-1 text-gray-400">
                          {m.created_at.slice(2, 16)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && memos.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-1.5 text-right">총 {memos.length} 건</p>
      )}
    </div>
  );
}
