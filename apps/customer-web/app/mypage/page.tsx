/**
 * Phase Next-Day13 (2026-05-09): /mypage 본격 (tRPC + Drizzle).
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';

interface Summary {
  user: {
    id: number;
    real_name: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    approval_status: string | null;
  } | null;
  businesses: { id: number; company_name: string }[];
  rooms: { id: string; name: string | null; status: string | null }[];
  todayCount: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '⏳ 승인 대기', color: 'from-yellow-500 to-orange-500' },
  approved_client: { label: '⭐ 기장거래처', color: 'from-blue-500 to-blue-600' },
  approved_guest: { label: '✓ 일반승인', color: 'from-gray-500 to-gray-600' },
  rejected: { label: '✕ 거절', color: 'from-red-500 to-red-600' },
};

const DAILY_LIMITS: Record<string, string> = {
  pending: '일 5회',
  approved_client: '무제한',
  approved_guest: '일 5회',
  rejected: '0회',
};

export default function MyPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trpcCall<Summary>('mypage.summary')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const statusKey = data?.user?.approval_status || 'pending';
  const statusInfo = STATUS_LABELS[statusKey] || STATUS_LABELS.pending;
  const limit = DAILY_LIMITS[statusKey] || '일 5회';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-brand-primary text-sm">
          ← 챗봇
        </Link>
        <h1 className="text-lg font-bold">내 정보</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {loading && (
          <p className="text-center text-gray-400 py-12">불러오는 중...</p>
        )}

        {!loading && data && (
          <>
            {/* Status 배너 */}
            <div
              className={`bg-gradient-to-r ${statusInfo.color} text-white rounded-2xl p-5`}
            >
              <p className="text-sm opacity-90">{statusInfo.label}</p>
              <p className="text-xl font-bold mt-1">{limit} 이용</p>
              <p className="text-xs opacity-75 mt-2">
                오늘 {data.todayCount}건 사용
              </p>
            </div>

            {/* 사용자 정보 */}
            <section className="bg-white rounded-2xl p-5">
              <h2 className="font-bold mb-3">👤 내 정보</h2>
              <dl className="space-y-2 text-sm">
                <Field label="이름" value={data.user?.real_name || data.user?.name} />
                <Field label="전화" value={data.user?.phone} />
                <Field label="이메일" value={data.user?.email} />
              </dl>
            </section>

            {/* 내 사업장 */}
            <section className="bg-white rounded-2xl p-5">
              <h2 className="font-bold mb-3">
                🏢 내 사업장 ({data.businesses.length})
              </h2>
              {data.businesses.length === 0 ? (
                <p className="text-sm text-gray-400">
                  등록된 사업장 없음 (사장님께 등록 요청)
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.businesses.map((b) => (
                    <li key={b.id} className="text-sm border-b py-2 last:border-b-0">
                      {b.company_name}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 내 상담방 */}
            <section className="bg-white rounded-2xl p-5">
              <h2 className="font-bold mb-3">
                💬 내 상담방 ({data.rooms.length})
              </h2>
              {data.rooms.length === 0 ? (
                <p className="text-sm text-gray-400">상담방 없음</p>
              ) : (
                <ul className="space-y-2">
                  {data.rooms.map((r) => (
                    <li key={r.id} className="text-sm border-b py-2 last:border-b-0">
                      {r.name || r.id}
                      {r.status === 'closed' && (
                        <span className="ml-2 text-xs text-gray-400">(종료)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 빠른 액션 */}
            <section className="bg-white rounded-2xl p-5">
              <h2 className="font-bold mb-3">⚡ 빠른 액션</h2>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/"
                  className="bg-brand-primary text-white text-center py-3 rounded-xl font-medium"
                >
                  💬 챗봇 상담
                </Link>
                <button className="bg-gray-100 text-gray-700 py-3 rounded-xl font-medium">
                  📷 영수증 업로드
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value || '-'}</dd>
    </div>
  );
}
