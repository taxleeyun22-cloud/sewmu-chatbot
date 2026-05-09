/**
 * Phase Next-Day9 (2026-05-09): /admin/todos (내 일정).
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

interface Memo {
  id: number;
  content: string;
  due_date: string | null;
  is_checked: number | null;
  category: string | null;
}

export default function TodosPage() {
  const [list, setList] = useState<Memo[]>([]);

  useEffect(() => {
    trpcCall<{ memos: Memo[] }>('memos.list', { scope: 'my', limit: 100 }).then((d) =>
      setList(d.memos || []),
    );
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const overdue = list.filter((m) => m.due_date && m.due_date < today && !m.is_checked);
  const todayMemos = list.filter((m) => m.due_date === today && !m.is_checked);
  const upcoming = list.filter((m) => m.due_date && m.due_date > today && !m.is_checked);
  const done = list.filter((m) => m.is_checked === 1);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📋 내 일정</h1>

      <Section title="🚨 지난 일정" items={overdue} color="red" />
      <Section title="📅 오늘" items={todayMemos} color="blue" />
      <Section title="📆 임박" items={upcoming.slice(0, 10)} color="orange" />
      <Section title="✅ 완료" items={done.slice(0, 5)} color="gray" />
    </div>
  );
}

function Section({
  title,
  items,
  color,
}: {
  title: string;
  items: Memo[];
  color: 'red' | 'blue' | 'orange' | 'gray';
}) {
  const bgMap = {
    red: 'bg-red-50 border-red-200',
    blue: 'bg-blue-50 border-blue-200',
    orange: 'bg-orange-50 border-orange-200',
    gray: 'bg-gray-50 border-gray-200',
  };
  return (
    <section className="mb-6">
      <h2 className="font-bold mb-3">
        {title} <span className="text-gray-500 text-sm">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">없음</p>
      ) : (
        <ul className={`rounded-xl border p-3 ${bgMap[color]}`}>
          {items.map((m) => (
            <li key={m.id} className="py-2 border-b last:border-b-0 border-gray-100">
              <p className="text-sm">{m.content}</p>
              <p className="text-xs text-gray-500 mt-1">
                {m.category && `[${m.category}] `}
                {m.due_date && `📅 ${m.due_date}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
