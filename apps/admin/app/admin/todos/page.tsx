/** Phase Next-Day28 (2026-05-11): /admin/todos React Query. */
'use client';

import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { AlarmClock, AlertCircle, Calendar, CalendarClock, CheckCircle } from 'lucide-react';

interface Memo {
  id: number; content: string; due_date: string | null; is_checked: number | null; category: string | null;
}

export default function TodosPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['memos.list', 'my'],
    queryFn: () => trpcCall<{ memos: Memo[] }>('memos.list', { scope: 'my', limit: 100 }),
  });

  const list = data?.memos || [];
  const today = new Date().toISOString().slice(0, 10);
  const overdue = list.filter((m) => m.due_date && m.due_date < today && !m.is_checked);
  const todayMemos = list.filter((m) => m.due_date === today && !m.is_checked);
  const upcoming = list.filter((m) => m.due_date && m.due_date > today && !m.is_checked);
  const done = list.filter((m) => m.is_checked === 1);

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <AlarmClock size={18} strokeWidth={2} className="text-brand-primary" />내 일정
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">D-day 임박 + 오늘 + 완료</p>
      </header>

      {isLoading && Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}><CardContent className="py-2"><Skeleton className="h-16 w-full" /></CardContent></Card>
      ))}

      {!isLoading && <>
        <Section title="지난 일정" icon={AlertCircle} items={overdue} variant="danger" />
        <Section title="오늘" icon={Calendar} items={todayMemos} variant="primary" />
        <Section title="임박" icon={CalendarClock} items={upcoming.slice(0, 10)} variant="warning" />
        <Section title="완료" icon={CheckCircle} items={done.slice(0, 5)} variant="success" />
      </>}
    </div>
  );
}

function Section({ title, icon: Icon, items, variant }: {
  title: string;
  icon: typeof AlarmClock;
  items: Memo[];
  variant: 'danger' | 'primary' | 'warning' | 'success';
}) {
  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <Icon size={12} strokeWidth={2} />
          {title}
          <Badge variant={variant}>{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <EmptyState title="없음" className="py-2" />
        ) : (
          <ul className="space-y-1">
            {items.map((m) => (
              <li key={m.id} className="py-1 border-b last:border-b-0 border-gray-100">
                <p className="text-xs leading-snug">{m.content}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {m.category && <Badge variant="default">{m.category}</Badge>}
                  {m.due_date && <span className="text-[10px] text-gray-500 font-mono">📅 {m.due_date}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
