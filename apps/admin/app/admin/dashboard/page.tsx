/**
 * Phase Next-Day6 (2026-05-09): /admin/dashboard (tRPC + Drizzle 본격).
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
  errorLogs: number;
}

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    trpcCall<Counts>('dashboard.counts').then(setCounts).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        대시보드
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <DashCard label="대기 거래처" count={counts?.pendingUsers ?? '--'} href="/admin/users?status=pending" color="yellow" />
        <DashCard label="기장거래처" count={counts?.approvedClients ?? '--'} href="/admin/users?status=approved_client" color="blue" />
        <DashCard label="활성 상담방" count={counts?.activeRooms ?? '--'} href="/admin/rooms" color="green" />
        <DashCard label="임박 일정 (7일)" count={counts?.urgentTodos ?? '--'} href="/admin/todos" color="orange" />
      </div>

      {/* 빠른 진입 */}
      <section className="bg-white rounded-2xl p-6 mb-6">
        <h2 className="font-bold mb-4">⚡ 빠른 진입</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickLink icon="🔍" label="전역 검색" href="/admin/search" />
          <QuickLink icon="📒" label="새 메모" href="/admin/memos/new" />
          <QuickLink icon="📢" label="단체발송" href="/admin/bulk-send" />
          <QuickLink icon="📋" label="신고 검토표" href="/admin/filings" />
        </div>
      </section>

      <div className="text-center text-sm text-gray-400 mt-12">
        Phase Next-Week4 Day 1 — 골격 완성. Day 2: tRPC 실시간 데이터 연동.
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
  color: 'yellow' | 'blue' | 'orange' | 'green';
}) {
  const colorMap = {
    yellow: 'border-yellow-200 bg-yellow-50',
    blue: 'border-blue-200 bg-blue-50',
    orange: 'border-orange-200 bg-orange-50',
    green: 'border-green-200 bg-green-50',
  };
  return (
    <Link
      href={href}
      className={`block border-2 rounded-2xl p-4 hover:shadow-md transition-shadow ${colorMap[color]}`}
    >
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{count}</p>
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
