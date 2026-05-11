/**
 * Phase Next-Day28 (2026-05-11): Sidebar — shadcn/ui 패턴 + 실시간 카운트.
 * 사장님 명령 "구글직원처럼 + UI 예쁘게".
 *
 * - 30초 polling (dashboard.counts)
 * - badge color 자동 (status / 심각도)
 * - active state 명시 (border-l-brand-primary)
 * - 컴팩트 (w-52, py-1, text-[13px])
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { badgeClass, type CountKey } from './sidebar-badge';
import { cn } from '@/lib/utils';

export { badgeClass } from './sidebar-badge';

interface DashboardCounts {
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

interface NavItem {
  href: string;
  icon: string;
  label: string;
  countKey?: CountKey;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '방',
    items: [
      { href: '/admin/rooms', icon: '💬', label: '상담방', countKey: 'activeRooms' },
      { href: '/admin/internal', icon: '🔐', label: '관리자방' },
    ],
  },
  {
    title: '사용자/업체',
    items: [
      { href: '/admin/users', icon: '👤', label: '사용자', countKey: 'pendingUsers' },
      { href: '/admin/businesses', icon: '🏢', label: '업체' },
    ],
  },
  {
    title: '문서·메모',
    items: [
      { href: '/admin/docs', icon: '📄', label: '문서', countKey: 'pendingDocs' },
      { href: '/admin/memos', icon: '📒', label: '메모' },
    ],
  },
  {
    title: '관리',
    items: [
      { href: '/admin/dashboard', icon: '📊', label: '대시보드' },
      { href: '/admin/analytics', icon: '📈', label: '분석' },
      { href: '/admin/review', icon: '✓', label: '검증', countKey: 'reviewPending' },
      { href: '/admin/faq', icon: '📚', label: 'FAQ' },
      { href: '/admin/filings', icon: '📋', label: '신고 검토표', countKey: 'filingsInProgress' },
    ],
  },
  {
    title: '알림',
    items: [
      { href: '/admin/todos', icon: '⏰', label: '내 일정', countKey: 'urgentTodos' },
      { href: '/admin/term-req', icon: '⚠️', label: '종료 요청' },
      { href: '/admin/bulk-send', icon: '📢', label: '단체발송' },
      { href: '/admin/search', icon: '🔍', label: '전역 검색' },
      { href: '/admin/trash', icon: '🗑️', label: '휴지통' },
      { href: '/admin/errors', icon: '🐞', label: '에러 로그', countKey: 'errorLogs' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<DashboardCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCounts = () =>
      trpcCall<DashboardCounts>('dashboard.counts')
        .then((d) => {
          if (!cancelled) setCounts(d);
        })
        .catch(() => {});
    fetchCounts();
    const t = setInterval(fetchCounts, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <aside className="w-52 bg-sb-bg border-r border-gray-200 flex flex-col">
      {/* 로고 영역 — 구글 admin 느낌 */}
      <div className="px-3 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand-primary text-white flex items-center justify-center text-xs font-bold">
            세
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 text-xs truncate">세무회계 이윤</h1>
            <p className="text-[10px] text-sb-text-mute truncate">이재윤 대표세무사</p>
          </div>
        </div>
      </div>

      {/* 네비 */}
      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-2">
            <h2 className="px-3 mb-0.5 mt-1 text-[10px] font-semibold text-sb-text-mute uppercase tracking-wider">
              {section.title}
            </h2>
            <ul>
              {section.items.map((item) => {
                const active = pathname === item.href;
                const count = item.countKey && counts ? counts[item.countKey] : 0;
                const cls = badgeClass(item.countKey, count);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group flex items-center gap-1.5 px-3 py-1 text-[13px] leading-tight transition-all',
                        active
                          ? 'bg-sb-active-bg text-sb-active-text font-medium border-l-2 border-l-brand-primary'
                          : 'text-sb-text hover:bg-white hover:text-gray-900 border-l-2 border-l-transparent',
                      )}
                    >
                      <span className="w-4 text-center text-[13px]">{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={cn('text-[10px] px-1 py-0 rounded-full leading-4 font-medium', cls)}
                          data-testid={`badge-${item.countKey}`}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 하단 — actions */}
      <div className="border-t border-gray-200 bg-white px-3 py-2 space-y-1">
        <button
          onClick={async () => {
            if (!confirm('로그아웃 하시겠습니까?')) return;
            try {
              await fetch('/api/admin-logout', { method: 'POST' });
            } catch {}
            window.location.href = '/login';
          }}
          className="w-full text-left text-[11px] text-gray-600 hover:text-red-600 flex items-center gap-1.5 py-1 rounded hover:bg-red-50 px-1 transition-colors"
        >
          <span>⏻</span>
          <span>로그아웃</span>
        </button>
        <a
          href="https://sewmu-chatbot.pages.dev"
          target="_blank"
          rel="noreferrer"
          className="w-full text-[11px] text-gray-600 hover:text-brand-primary flex items-center gap-1.5 py-1 rounded hover:bg-blue-50 px-1 transition-colors"
        >
          <span>↗</span>
          <span>거래처 챗봇</span>
        </a>
      </div>
    </aside>
  );
}
