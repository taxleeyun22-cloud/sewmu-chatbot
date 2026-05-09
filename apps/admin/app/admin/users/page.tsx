/**
 * Phase Next-Day6 (2026-05-09): /admin/users (tRPC + Drizzle 본격).
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

const STATUS_TABS = [
  { key: 'pending', label: '대기' },
  { key: 'approved_client', label: '기장거래처' },
  { key: 'rejected', label: '거절' },
  { key: 'terminated', label: '종료' },
  { key: 'rejoined', label: '재가입' },
  { key: 'admin', label: '관리자' },
];

interface User {
  id: number;
  real_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  approval_status: string | null;
  is_admin: number | null;
}

export default function UsersPage() {
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    trpcCall<{ users: User[] }>('users.list', { status, search, limit: 100 })
      .then((data) => {
        if (!cancelled) setUsers(data.users);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
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
        <h1 className="text-2xl font-bold text-gray-900">사용자</h1>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 이름 / 전화 / 이메일 검색"
          className="w-80 px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              status === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6">
        {loading && (
          <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>
        )}
        {error && (
          <p className="text-center text-red-500 py-12 text-sm">오류: {error}</p>
        )}
        {!loading && !error && users.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">
            해당 status 의 사용자가 없습니다.
          </p>
        )}
        {!loading && users.length > 0 && (
          <ul className="divide-y divide-gray-200">
            {users.map((u) => (
              <li key={u.id} className="py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-primary text-white flex items-center justify-center font-bold">
                  {(u.real_name || u.name || '?')[0]}
                </div>
                <div className="flex-1">
                  <p className="font-medium">
                    {u.real_name || u.name || '이름없음'}
                    {u.is_admin === 1 && (
                      <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        👑 관리자
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {u.phone || '-'} · {u.email || '-'}
                  </p>
                </div>
                <button className="text-xs text-brand-primary hover:underline">
                  →
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
