/**
 * Phase Next-Day28 (2026-05-11): /admin/dashboard 컴팩트 — 옛 admin.html 톤.
 * 사장님 명령: "새 어드민 컴팩트하게 변동 ㄱㄱ"
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
    <div className="p-3">
      <h1 className="text-base font-bold text-gray-900 mb-2">📊 대시보드</h1>

      {/* 8개 KPI 카드 — 컴팩트 */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5 mb-3">
        <DashCard label="대기" count={counts?.pendingUsers ?? '-'} href="/admin/users?status=pending" color="yellow" />
        <DashCard label="기장" count={counts?.approvedClients ?? '-'} href="/admin/users?status=approved_client" color="blue" />
        <DashCard label="활성방" count={counts?.activeRooms ?? '-'} href="/admin/rooms" color="green" />
        <DashCard label="임박" count={counts?.urgentTodos ?? '-'} href="/admin/todos" color="orange" />
        <DashCard label="영수증" count={counts?.pendingDocs ?? '-'} href="/admin/docs?status=pending" color="red" />
        <DashCard label="검증" count={counts?.reviewPending ?? '-'} href="/admin/review" color="purple" />
        <DashCard label="신고" count={counts?.filingsInProgress ?? '-'} href="/admin/filings" color="indigo" />
        <DashCard label="에러" count={counts?.errorLogs ?? '-'} href="/admin/errors" color="gray" />
      </div>

      {/* 빠른 진입 — 컴팩트 */}
      <section className="bg-white rounded-lg border border-gray-200 p-2 mb-3">
        <h2 className="font-bold mb-1.5 text-xs">⚡ 빠른 진입</h2>
        <div className="grid grid-cols-5 gap-1">
          <QuickLink icon="🔍" label="전역 검색" href="/admin/search" />
          <QuickLink icon="📒" label="메모" href="/admin/memos" />
          <QuickLink icon="📢" label="단체발송" href="/admin/bulk-send" />
          <QuickLink icon="📋" label="신고 검토표" href="/admin/filings" />
          <QuickLink icon="📚" label="FAQ" href="/admin/faq" />
        </div>
      </section>

      {/* Recent Feed — 3 컬럼 컴팩트 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
      className={`block border rounded-lg px-2 py-1.5 hover:shadow-sm transition-shadow ${colorMap[color]}`}
    >
      <p className="text-[10px] text-gray-600">{label}</p>
      <p className="text-base font-bold text-gray-900 leading-tight">{count}</p>
    </Link>
  );
}

function QuickLink({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-0.5 py-1.5 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[10px] font-medium text-gray-700">{label}</span>
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
    <section className="bg-white rounded-lg border border-gray-200 p-2">
      <h3 className="font-bold mb-1 text-xs">{title}</h3>
      {!items && <p className="text-[10px] text-gray-400 py-3 text-center">불러오는 중...</p>}
      {items && items.length === 0 && (
        <p className="text-[10px] text-gray-400 py-3 text-center">{empty}</p>
      )}
      {items && items.length > 0 && (
        <ul className="space-y-0.5">
          {items.slice(0, 5).map((it) => (
            <li key={it.id}>
              <Link
                href={it.href}
                className="block px-1 py-1 rounded hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-900 truncate">{it.primary}</p>
                    <p className="text-[10px] text-gray-500 truncate">{it.secondary}</p>
                  </div>
                  {it.badge && (
                    <span className="text-[9px] bg-gray-100 text-gray-600 px-1 py-0 rounded-full whitespace-nowrap">
                      {it.badge}
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-gray-400">{it.time?.slice(0, 16)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
