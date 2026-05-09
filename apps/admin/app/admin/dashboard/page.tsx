/**
 * Phase Next-Day19 (2026-05-09): /admin/dashboard 확장.
 * 사장님 매일 진입 → 한눈에 KPI + recent feed.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';

interface Counts {
  pendingUsers: number;
  approvedClients: number;
  pendingDocs: number;
  activeRooms: number;
  unreadMessages: number;
  urgentTodos: number;
  reviewPending: number;
  filingsInProgress: number;
  errorLogs: number;
}

interface RecentMessage {
  id: number;
  content: string | null;
  role: string;
  confidence: string | null;
  user_name: string | null;
  created_at: string | null;
}

interface RecentUpload {
  id: number;
  doc_type: string;
  status: string | null;
  vendor: string | null;
  amount: number | null;
  user_name: string | null;
  created_at: string | null;
}

interface RecentMemo {
  id: number;
  content: string;
  category: string | null;
  due_date: string | null;
  author_name: string | null;
  created_at: string | null;
}

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<{
    recentMessages: RecentMessage[];
    recentUploads: RecentUpload[];
    recentMemos: RecentMemo[];
  } | null>(null);

  useEffect(() => {
    trpcCall<Counts>('dashboard.counts').then(setCounts).catch(() => {});
    trpcCall<{
      recentMessages: RecentMessage[];
      recentUploads: RecentUpload[];
      recentMemos: RecentMemo[];
    }>('dashboard.recent')
      .then(setRecent)
      .catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📊 대시보드</h1>

      {/* 8개 KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <DashCard
          label="대기 거래처"
          count={counts?.pendingUsers ?? '--'}
          href="/admin/users?status=pending"
          color="yellow"
        />
        <DashCard
          label="기장거래처"
          count={counts?.approvedClients ?? '--'}
          href="/admin/users?status=approved_client"
          color="blue"
        />
        <DashCard
          label="활성 상담방"
          count={counts?.activeRooms ?? '--'}
          href="/admin/rooms"
          color="green"
        />
        <DashCard
          label="임박 일정 (3일)"
          count={counts?.urgentTodos ?? '--'}
          href="/admin/todos"
          color="orange"
        />
        <DashCard
          label="미처리 영수증"
          count={counts?.pendingDocs ?? '--'}
          href="/admin/docs?status=pending"
          color="red"
        />
        <DashCard
          label="검증 대기 답변"
          count={counts?.reviewPending ?? '--'}
          href="/admin/review"
          color="purple"
        />
        <DashCard
          label="진행 중 신고"
          count={counts?.filingsInProgress ?? '--'}
          href="/admin/filings"
          color="indigo"
        />
        <DashCard
          label="에러 로그"
          count={counts?.errorLogs ?? '--'}
          href="#"
          color="gray"
        />
      </div>

      {/* 빠른 진입 */}
      <section className="bg-white rounded-2xl p-6 mb-6">
        <h2 className="font-bold mb-4">⚡ 빠른 진입</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <QuickLink icon="🔍" label="전역 검색" href="/admin/search" />
          <QuickLink icon="📒" label="메모" href="/admin/memos" />
          <QuickLink icon="📢" label="단체발송" href="/admin/bulk-send" />
          <QuickLink icon="📋" label="신고 검토표" href="/admin/filings" />
          <QuickLink icon="📚" label="FAQ" href="/admin/faq" />
        </div>
      </section>

      {/* Recent Feed — 3 컬럼 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RecentSection
          title="💬 최근 대화"
          empty="대화 없음"
          items={recent?.recentMessages.map((m) => ({
            id: m.id,
            primary: m.user_name || '익명',
            secondary: (m.content || '').slice(0, 50),
            badge: m.confidence || undefined,
            time: m.created_at || '',
            href: '/admin/review',
          }))}
        />
        <RecentSection
          title="📄 최근 업로드"
          empty="업로드 없음"
          items={recent?.recentUploads.map((u) => ({
            id: u.id,
            primary: u.user_name || '익명',
            secondary: `${u.doc_type} · ${u.vendor || '-'} · ${
              u.amount ? `${u.amount.toLocaleString()}원` : '-'
            }`,
            badge: u.status || 'pending',
            time: u.created_at || '',
            href: '/admin/docs',
          }))}
        />
        <RecentSection
          title="📒 최근 메모"
          empty="메모 없음"
          items={recent?.recentMemos.map((m) => ({
            id: m.id,
            primary: m.author_name || '사장님',
            secondary: m.content.slice(0, 50),
            badge: m.category || undefined,
            time: m.created_at || '',
            href: '/admin/memos',
          }))}
        />
      </div>
    </div>
  );
}

function DashCard({
  label,
  count,
  href,
  color,
}: {
  label: string;
  count: string | number;
  href: string;
  color: 'yellow' | 'blue' | 'orange' | 'green' | 'red' | 'purple' | 'indigo' | 'gray';
}) {
  const colorMap: Record<string, string> = {
    yellow: 'border-yellow-200 bg-yellow-50',
    blue: 'border-blue-200 bg-blue-50',
    orange: 'border-orange-200 bg-orange-50',
    green: 'border-green-200 bg-green-50',
    red: 'border-red-200 bg-red-50',
    purple: 'border-purple-200 bg-purple-50',
    indigo: 'border-indigo-200 bg-indigo-50',
    gray: 'border-gray-200 bg-gray-50',
  };
  return (
    <Link
      href={href}
      className={`block border-2 rounded-2xl p-4 hover:shadow-md transition-shadow ${colorMap[color]}`}
    >
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
    </Link>
  );
}

function QuickLink({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </Link>
  );
}

function RecentSection({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items?: { id: number; primary: string; secondary: string; badge?: string; time: string; href: string }[];
}) {
  return (
    <section className="bg-white rounded-2xl p-5">
      <h3 className="font-bold mb-3 text-sm">{title}</h3>
      {!items && <p className="text-xs text-gray-400 py-6 text-center">불러오는 중...</p>}
      {items && items.length === 0 && (
        <p className="text-xs text-gray-400 py-6 text-center">{empty}</p>
      )}
      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.slice(0, 5).map((it) => (
            <li key={it.id}>
              <Link
                href={it.href}
                className="block p-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {it.primary}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{it.secondary}</p>
                  </div>
                  {it.badge && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {it.badge}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {it.time?.slice(0, 16)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
