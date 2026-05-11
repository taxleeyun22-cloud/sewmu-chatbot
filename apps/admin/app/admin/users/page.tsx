/**
 * Phase Next-Day28 (2026-05-11): /admin/users 컴팩트 — table 스타일 (옛 admin.html 톤).
 * 사장님 명령: "새 어드민 컴팩트하게 변동 ㄱㄱ"
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
  provider?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
}

export default function UsersPage() {
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refetch() {
    setLoading(true);
    setError(null);
    trpcCall<{ users: User[] }>('users.list', { status, search, limit: 200 })
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    trpcCall<{ users: User[] }>('users.list', { status, search, limit: 200 })
      .then((d) => {
        if (!cancelled) setUsers(d.users);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
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
        <h1 className="text-base font-bold text-gray-900">사용자</h1>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 이름/전화/이메일"
          className="w-64 px-2.5 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </div>

      {/* status tabs — 컴팩트 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
              status === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* table — 컴팩트 (옛 admin.html 톤) */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && (
          <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>
        )}
        {error && (
          <p className="text-center text-red-500 py-6 text-xs">오류: {error}</p>
        )}
        {!loading && !error && users.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-xs">
            해당 status 의 사용자가 없습니다.
          </p>
        )}
        {!loading && users.length > 0 && (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] text-gray-600">
              <tr>
                <th className="px-2 py-1.5 text-left w-8">#</th>
                <th className="px-2 py-1.5 text-left">이름</th>
                <th className="px-2 py-1.5 text-left">연락처</th>
                <th className="px-2 py-1.5 text-left">이메일</th>
                <th className="px-2 py-1.5 text-left w-16">로그인</th>
                <th className="px-2 py-1.5 text-left w-24">가입일</th>
                <th className="px-2 py-1.5 text-right w-32">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1 text-gray-400">{u.id}</td>
                  <td className="px-2 py-1">
                    <span className="font-medium">
                      {u.real_name || u.name || '이름없음'}
                    </span>
                    {u.is_admin === 1 && (
                      <span className="ml-1 text-[10px] bg-purple-100 text-purple-700 px-1 py-0 rounded">
                        👑
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-gray-700 font-mono">
                    {u.phone || '-'}
                  </td>
                  <td className="px-2 py-1 text-gray-600 truncate max-w-[180px]">
                    {u.email || '-'}
                  </td>
                  <td className="px-2 py-1">
                    {u.provider === 'kakao' && (
                      <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 py-0 rounded">
                        카톡
                      </span>
                    )}
                    {u.provider === 'naver' && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1 py-0 rounded">
                        네이버
                      </span>
                    )}
                    {!u.provider && (
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1 py-0 rounded">
                        수동
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-[10px] text-gray-500 font-mono">
                    {u.created_at ? u.created_at.slice(2, 10) : '-'}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <UserActions user={u} onChanged={refetch} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 총 N건 */}
      {!loading && users.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-1.5 text-right">
          총 {users.length} 건
        </p>
      )}
    </div>
  );
}

function UserActions({ user, onChanged }: { user: User; onChanged: () => void }) {
  async function setStatus(status: string) {
    if (!confirm(`${user.real_name || user.name} 을(를) ${status} 으로 변경?`)) return;
    await trpcCall('users.setStatus', { userId: user.id, status });
    onChanged();
  }

  return (
    <div className="flex gap-0.5 justify-end">
      {user.approval_status === 'pending' && (
        <>
          <button
            onClick={() => setStatus('approved_client')}
            className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded"
            title="기장거래처 승급"
          >
            ⭐기장
          </button>
          <button
            onClick={() => setStatus('rejected')}
            className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded"
            title="거절"
          >
            ✕거절
          </button>
        </>
      )}
      {user.approval_status === 'approved_client' && (
        <button
          onClick={() => setStatus('terminated')}
          className="text-[10px] bg-gray-500 text-white px-1.5 py-0.5 rounded"
          title="종료"
        >
          ⛔종료
        </button>
      )}
      {user.approval_status === 'rejected' && (
        <button
          onClick={() => setStatus('approved_client')}
          className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded"
          title="기장거래처 복구"
        >
          ↻복구
        </button>
      )}
    </div>
  );
}
