/**
 * Phase Next-Day28 (2026-05-11): /admin/businesses 컴팩트 — table 스타일.
 * 사장님 명령: "새 어드민 컴팩트하게 변동 ㄱㄱ"
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';

interface Business {
  id: number;
  company_name: string | null;
  business_number: string | null;
  ceo_name: string | null;
  status: string | null;
  parent_business_id: number | null;
  business_type?: string | null;
  industry?: string | null;
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
    <div className="p-3">
      {/* 헤더 — 컴팩트 */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <h1 className="text-base font-bold text-gray-900">업체</h1>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 업체명/사업자번호/대표자"
            className="w-72 px-2.5 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
          <button className="bg-brand-success text-white px-2.5 py-1 rounded text-xs font-medium">
            + 새 업체
          </button>
        </div>
      </div>

      {/* status tabs */}
      <div className="flex gap-1 mb-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-2.5 py-0.5 rounded text-xs font-medium ${
              status === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
            <span className="ml-1 opacity-75">
              {(counts as Record<string, number>)[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && (
          <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>
        )}
        {!loading && list.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-xs">등록된 업체가 없습니다.</p>
        )}
        {!loading && list.length > 0 && (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] text-gray-600">
              <tr>
                <th className="px-2 py-1.5 text-left w-8">#</th>
                <th className="px-2 py-1.5 text-left">업체명</th>
                <th className="px-2 py-1.5 text-left w-32">사업자번호</th>
                <th className="px-2 py-1.5 text-left w-20">대표자</th>
                <th className="px-2 py-1.5 text-left w-24">업종</th>
                <th className="px-2 py-1.5 text-left w-16">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((b) => {
                const isBranch = !!b.parent_business_id;
                return (
                  <tr
                    key={b.id}
                    className={`hover:bg-gray-50 cursor-pointer ${isBranch ? 'bg-blue-50/30' : ''}`}
                  >
                    <td className="px-2 py-1 text-gray-400">{b.id}</td>
                    <td className="px-2 py-1">
                      <Link
                        href={`/admin/businesses/${b.id}`}
                        className="font-medium hover:text-brand-primary"
                      >
                        <span className="mr-1">{isBranch ? '📍' : '🏢'}</span>
                        {b.company_name || '(이름없음)'}
                        {isBranch && (
                          <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1 py-0 rounded">
                            지점
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-2 py-1 font-mono text-gray-700">
                      {b.business_number || '-'}
                    </td>
                    <td className="px-2 py-1 text-gray-700">{b.ceo_name || '-'}</td>
                    <td className="px-2 py-1 text-gray-600 truncate max-w-[120px]">
                      {b.business_type || b.industry || '-'}
                    </td>
                    <td className="px-2 py-1">
                      {b.status === 'closed' && (
                        <span className="text-[10px] bg-gray-200 text-gray-600 px-1 py-0 rounded">
                          📦 종료
                        </span>
                      )}
                      {b.status === 'terminated' && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1 py-0 rounded">
                          🚫 이관
                        </span>
                      )}
                      {(!b.status || b.status === 'active') && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1 py-0 rounded">
                          ✓ 활성
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && list.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-1.5 text-right">총 {list.length} 건</p>
      )}
    </div>
  );
}
