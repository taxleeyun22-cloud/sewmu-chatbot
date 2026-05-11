/**
 * Phase Next-Day28 (2026-05-11): /admin/todos — shadcn/ui.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">📋 내 일정</h1>
        <p className="text-xs text-gray-500 mt-0.5">D-day 임박 + 오늘 + 완료</p>
      </header>

      <Section title="🚨 지난 일정" items={overdue} variant="danger" />
      <Section title="📅 오늘" items={todayMemos} variant="primary" />
      <Section title="📆 임박" items={upcoming.slice(0, 10)} variant="warning" />
      <Section title="✓ 완료" items={done.slice(0, 5)} variant="success" />
    </div>
  );
}

function Section({
  title,
  items,
  variant,
}: {
  title: string;
  items: Memo[];
  variant: 'danger' | 'primary' | 'warning' | 'success';
}) {
  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs flex items-center gap-1.5">
          {title}
          <Badge variant={variant}>{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-[11px] text-gray-400 py-1">없음</p>
        ) : (
          <ul className="space-y-1">
            {items.map((m) => (
              <li key={m.id} className="py-1 border-b last:border-b-0 border-gray-100">
                <p className="text-xs leading-snug">{m.content}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {m.category && <Badge variant="default">{m.category}</Badge>}
                  {m.due_date && (
                    <span className="text-[10px] text-gray-500 font-mono">
                      📅 {m.due_date}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
