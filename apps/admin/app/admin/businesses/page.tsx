/**
 * Phase Next-Day6 (2026-05-09): /admin/businesses (tRPC + Drizzle).
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

interface Business {
  id: number;
  company_name: string | null;
  business_number: string | null;
  ceo_name: string | null;
  status: string | null;
  parent_business_id: number | null;
}

const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '활성' },
  { key: 'closed', label: '종료' },
  { key: 'terminated', label: '이관' },
];

export default function BusinessesPage() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Business[]>([]);
  const [counts, setCounts] = useState({ all: 0, active: 0, closed: 0, terminated: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    trpcCall<{ businesses: Business[]; counts: typeof counts }>('businesses.list', {
      status: status as 'all' | 'active' | 'closed' | 'terminated',
      search,
      limit: 200,
    })
      .then((data) => {
        if (!cancelled) {
          setList(data.businesses);
          setCounts(data.counts);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, search]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">업체</h1>
        <button className="bg-brand-success text-white px-4 py-2 rounded-lg font-medium">
          + 새 업체
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 업체명 / 사업자번호 / 대표자명 검색"
        className="w-full px-4 py-2 mb-4 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />

      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              status === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
            <span className="ml-2 opacity-75">
              {(counts as Record<string, number>)[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6">
        {loading && (
          <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>
        )}
        {!loading && list.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">등록된 업체가 없습니다.</p>
        )}
        {!loading && list.length > 0 && (
          <ul className="space-y-2">
            {list.map((b) => {
              const isBranch = !!b.parent_business_id;
              return (
                <li
                  key={b.id}
                  className={`p-4 border rounded-xl hover:border-brand-primary transition-colors cursor-pointer ${
                    isBranch ? 'ml-6 border-blue-200 bg-blue-50/30' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{isBranch ? '📍' : '🏢'}</span>
                    <div className="flex-1">
                      <p className="font-medium">
                        {b.company_name || '(이름없음)'}
                        {isBranch && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            지점
                          </span>
                        )}
                        {b.status === 'closed' && (
                          <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                            📦 종료
                          </span>
                        )}
                        {b.status === 'terminated' && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            🚫 이관
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {b.business_number || '-'}
                        {b.ceo_name && ` · 대표 ${b.ceo_name}`}
                      </p>
                    </div>
                    <span className="text-brand-primary">›</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
