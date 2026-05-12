/**
 * Phase Next-Day28 (2026-05-11): /admin/memos — React Query + lucide + 카톡 톤.
 */
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  StickyNote,
  Plus,
  Pin,
  Phone,
  Folder,
  AlertTriangle,
  Calendar,
  Pencil,
} from 'lucide-react';

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
  { key: '', label: '전체', icon: StickyNote },
  { key: '할 일', label: '할 일', icon: Pin },
  { key: '전화', label: '전화', icon: Phone },
  { key: '문서', label: '문서', icon: Folder },
  { key: '이슈', label: '이슈', icon: AlertTriangle },
  { key: '약속', label: '약속', icon: Calendar },
  { key: '일반', label: '일반', icon: Pencil },
];

export default function MemosPage() {
  const [category, setCategory] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['memos.list', 'my', category],
    queryFn: () =>
      trpcCall<{ memos: Memo[] }>('memos.list', {
        scope: 'my',
        category: category || undefined,
        limit: 1000,
      }),
  });

  const memos = data?.memos || [];
  const activeCategory = CATEGORIES.find((c) => c.key === category);

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <StickyNote size={18} strokeWidth={2} className="text-brand-primary" />
            메모
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">7카테고리 · 첨부 + #태그 + D-day</p>
        </div>
        <Button size="sm">
          <Plus size={12} strokeWidth={2} className="mr-1" />
          빠른 메모
        </Button>
      </header>

      <Tabs value={category} onValueChange={setCategory}>
        <TabsList>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <TabsTrigger key={c.key} value={c.key} className="gap-1">
                <Icon size={11} strokeWidth={1.8} />
                {c.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              {activeCategory && <activeCategory.icon size={12} strokeWidth={2} />}
              {activeCategory?.label} 메모
            </span>
            {!isLoading && memos.length > 0 && (
              <Badge variant="default">총 {memos.length} 건</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {isLoading && (
            <ul className="divide-y divide-gray-100 border-t border-gray-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-3 py-2 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </li>
              ))}
            </ul>
          )}
          {!isLoading && memos.length === 0 && (
            <EmptyState
              icon={<StickyNote size={32} strokeWidth={1.5} />}
              title="메모 없음"
              description="+ 빠른 메모 버튼으로 추가하세요"
            />
          )}
          {!isLoading && memos.length > 0 && (
            <ul className="divide-y divide-gray-100 border-t border-gray-100">
              {memos.map((m) => (
                <li key={m.id} className="px-3 py-1.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={m.is_checked === 1}
                      onChange={() => {}}
                      className="mt-0.5 w-3.5 h-3.5 accent-brand-primary cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug whitespace-pre-wrap ${m.is_checked === 1 ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {m.content}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {m.category && <Badge variant="default">{m.category}</Badge>}
                        {m.due_date && (
                          <Badge variant={isUrgent(m.due_date) ? 'danger' : 'default'}>
                            <Calendar size={9} strokeWidth={2} className="mr-0.5" />
                            {m.due_date}
                          </Badge>
                        )}
                        {m.author_name && (
                          <span className="text-[10px] text-gray-500">
                            · {m.author_name}
                          </span>
                        )}
                        {m.created_at && (
                          <span className="text-[10px] text-gray-400 font-mono ml-auto">
                            {m.created_at.slice(2, 16)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function isUrgent(due: string | null): boolean {
  if (!due) return false;
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date(due);
  const t = new Date(today);
  const diff = Math.floor((d.getTime() - t.getTime()) / 86400000);
  return diff <= 3;
}
