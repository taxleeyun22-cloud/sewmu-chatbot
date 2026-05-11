/**
 * Phase Next-Day28 (2026-05-11): /admin/search — shadcn/ui.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface SearchData {
  users: Array<{ id: number; real_name: string | null; name: string | null; phone: string | null }>;
  rooms: Array<{ id: string; name: string | null }>;
  memos: Array<{ id: number; content: string }>;
  businesses: Array<{ id: number; company_name: string | null }>;
}

function SearchResults({ query }: { query: string }) {
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      trpcCall<SearchData>('search.global', { query })
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  if (loading) return <p className="text-center text-gray-400 py-6 text-xs">검색 중...</p>;
  if (!data) return null;

  const total = data.users.length + data.rooms.length + data.memos.length + data.businesses.length;
  if (total === 0) {
    return (
      <p className="text-center text-gray-400 py-6 text-xs">"{query}" 결과 없음</p>
    );
  }

  return (
    <div className="space-y-3">
      {data.users.length > 0 && (
        <Section title="👤 사용자" count={data.users.length}>
          {data.users.map((u) => (
            <div key={u.id} className="text-xs py-1 px-1.5 hover:bg-gray-50 rounded">
              <span className="font-medium">{u.real_name || u.name || `#${u.id}`}</span>{' '}
              <span className="text-gray-400 font-mono ml-1">{u.phone}</span>
            </div>
          ))}
        </Section>
      )}
      {data.rooms.length > 0 && (
        <Section title="💬 상담방" count={data.rooms.length}>
          {data.rooms.map((r) => (
            <div key={r.id} className="text-xs py-1 px-1.5 hover:bg-gray-50 rounded">
              {r.name || r.id}
            </div>
          ))}
        </Section>
      )}
      {data.memos.length > 0 && (
        <Section title="📒 메모" count={data.memos.length}>
          {data.memos.map((m) => (
            <div key={m.id} className="text-xs py-1 px-1.5 line-clamp-2 hover:bg-gray-50 rounded">
              {m.content}
            </div>
          ))}
        </Section>
      )}
      {data.businesses.length > 0 && (
        <Section title="🏢 업체" count={data.businesses.length}>
          {data.businesses.map((b) => (
            <div key={b.id} className="text-xs py-1 px-1.5 hover:bg-gray-50 rounded">
              {b.company_name || `#${b.id}`}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-bold text-gray-600 uppercase mb-1 flex items-center gap-1.5">
        {title}
        <Badge variant="default">{count}</Badge>
      </h3>
      <div className="bg-gray-50 rounded-md p-1.5">{children}</div>
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">🔍 전역 검색</h1>
        <p className="text-xs text-gray-500 mt-0.5">사용자 · 상담방 · 메시지 · 메모 · 업체 · 문서</p>
      </header>

      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="2자 이상 입력하세요..."
        autoFocus
        className="h-10"
      />

      <Card>
        <CardContent className="py-3">
          {query.length < 2 ? (
            <p className="text-center text-gray-400 py-6 text-xs">2자 이상 입력하세요</p>
          ) : (
            <SearchResults query={query} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
