/**
 * Phase Next-Week5 (2026-05-09): /admin/search.
 * 기존 admin-search-bulk.js (전역 검색) 마이그레이션.
 * 7개 그룹: 사용자 / 상담방 / 메시지 / 메모 / 업체 / 문서 / 일반대화
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

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

  if (loading) return <p className="text-center text-gray-400 py-8 text-sm">검색 중...</p>;
  if (!data) return null;

  const total =
    data.users.length + data.rooms.length + data.memos.length + data.businesses.length;
  if (total === 0) {
    return (
      <p className="text-center text-gray-400 py-8 text-sm">
        "{query}" 결과 없음
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.users.length > 0 && (
        <Section title={`👤 사용자 ${data.users.length}명`}>
          {data.users.map((u) => (
            <div key={u.id} className="text-xs py-0.5">
              {u.real_name || u.name || `#${u.id}`}{' '}
              <span className="text-gray-400 font-mono">{u.phone}</span>
            </div>
          ))}
        </Section>
      )}
      {data.rooms.length > 0 && (
        <Section title={`💬 상담방 ${data.rooms.length}개`}>
          {data.rooms.map((r) => (
            <div key={r.id} className="text-xs py-0.5">
              {r.name || r.id}
            </div>
          ))}
        </Section>
      )}
      {data.memos.length > 0 && (
        <Section title={`📒 메모 ${data.memos.length}건`}>
          {data.memos.map((m) => (
            <div key={m.id} className="text-xs py-0.5 line-clamp-2">
              {m.content}
            </div>
          ))}
        </Section>
      )}
      {data.businesses.length > 0 && (
        <Section title={`🏢 업체 ${data.businesses.length}개`}>
          {data.businesses.map((b) => (
            <div key={b.id} className="text-xs py-0.5">
              {b.company_name || `#${b.id}`}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-0.5">{title}</h3>
      <div className="bg-gray-50 rounded px-2 py-1">{children}</div>
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');

  return (
    <div className="p-3 max-w-4xl mx-auto">
      <h1 className="text-base font-bold text-gray-900 mb-2">🔍 전역 검색</h1>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="사용자 · 상담방 · 메시지 · 메모 · 업체 · 문서 검색"
        autoFocus
        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary"
      />

      <div className="mt-2 bg-white rounded-lg border border-gray-200 p-2.5">
        {query.length < 2 ? (
          <p className="text-center text-gray-400 py-6 text-xs">2자 이상 입력하세요</p>
        ) : (
          <SearchResults query={query} />
        )}
      </div>
    </div>
  );
}
