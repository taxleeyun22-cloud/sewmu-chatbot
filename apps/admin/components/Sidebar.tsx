/**
 * Phase Next-Day28 (2026-05-11): Sidebar — lucide-react + React Query.
 * 구글직원 패턴: professional icons + 자동 reactive count.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { badgeClass, type CountKey } from './sidebar-badge';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import {
  MessageSquare,
  Lock,
  User,
  Building2,
  FileText,
  StickyNote,
  LayoutDashboard,
  BarChart3,
  CheckCircle2,
  BookOpen,
  ClipboardList,
  AlarmClock,
  AlertTriangle,
  Megaphone,
  Search,
  Trash2,
  Bug,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export { badgeClass } from './sidebar-badge';

interface DashboardCounts {
  pendingUsers: number;
  approvedClients: number;
  rejectedUsers: number;
  terminatedUsers: number;
  adminUsers: number;
  businesses: number;
  memosTotal: number;
  trash: number;
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
  icon: LucideIcon;
  label: string;
  countKey?: CountKey;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '방',
    items: [
      { href: '/admin/rooms', icon: MessageSquare, label: '상담방', countKey: 'activeRooms' },
      { href: '/admin/internal', icon: Lock, label: '관리자방' },
    ],
  },
  {
    title: '사용자/업체',
    items: [
      { href: '/admin/users', icon: User, label: '사용자', countKey: 'pendingUsers' },
      { href: '/admin/businesses', icon: Building2, label: '업체', countKey: 'businesses' },
    ],
  },
  {
    title: '문서·메모',
    items: [
      { href: '/admin/docs', icon: FileText, label: '문서', countKey: 'pendingDocs' },
      { href: '/admin/memos', icon: StickyNote, label: '메모', countKey: 'memosTotal' },
    ],
  },
  {
    title: '관리',
    items: [
      { href: '/admin/dashboard', icon: LayoutDashboard, label: '대시보드' },
      { href: '/admin/analytics', icon: BarChart3, label: '분석' },
      { href: '/admin/review', icon: CheckCircle2, label: '검증', countKey: 'reviewPending' },
      { href: '/admin/faq', icon: BookOpen, label: 'FAQ' },
      { href: '/admin/filings', icon: ClipboardList, label: '신고 검토표', countKey: 'filingsInProgress' },
    ],
  },
  {
    title: '알림',
    items: [
      { href: '/admin/todos', icon: AlarmClock, label: '내 일정', countKey: 'urgentTodos' },
      { href: '/admin/term-req', icon: AlertTriangle, label: '종료 요청' },
      { href: '/admin/bulk-send', icon: Megaphone, label: '단체발송' },
      { href: '/admin/search', icon: Search, label: '전역 검색' },
      { href: '/admin/trash', icon: Trash2, label: '휴지통', countKey: 'trash' },
      { href: '/admin/errors', icon: Bug, label: '에러 로그', countKey: 'errorLogs' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  /* React Query — 30s polling, window focus refetch */
  const { data: counts } = useQuery<DashboardCounts>({
    queryKey: ['dashboard.counts'],
    queryFn: () => trpcCall<DashboardCounts>('dashboard.counts'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  async function handleLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    try {
      await fetch('/api/admin-logout', { method: 'POST' });
    } catch {}
    window.location.href = '/login';
  }

  return (
    <aside className="w-52 bg-sb-bg border-r border-gray-200 flex flex-col">
      {/* 로고 영역 */}
      <div className="px-3 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <Avatar name="세" variant="primary" size="sm" />
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
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-1.5 text-[13px] leading-tight transition-all',
                        active
                          ? 'bg-sb-active-bg text-sb-active-text font-medium border-l-2 border-l-brand-primary'
                          : 'text-sb-text hover:bg-white hover:text-gray-900 border-l-2 border-l-transparent',
                      )}
                    >
                      <Icon size={14} className="flex-shrink-0" strokeWidth={1.8} />
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

      {/* 하단 */}
      <div className="border-t border-gray-200 bg-white px-3 py-2 space-y-0.5">
        <button
          onClick={handleLogout}
          className="w-full text-left text-[11px] text-gray-600 hover:text-red-600 flex items-center gap-1.5 py-1 rounded hover:bg-red-50 px-1 transition-colors"
        >
          <LogOut size={12} strokeWidth={1.8} />
          <span>로그아웃</span>
        </button>
        <a
          href="https://sewmu-chatbot.pages.dev"
          target="_blank"
          rel="noreferrer"
          className="w-full text-[11px] text-gray-600 hover:text-brand-primary flex items-center gap-1.5 py-1 rounded hover:bg-blue-50 px-1 transition-colors"
        >
          <ExternalLink size={12} strokeWidth={1.8} />
          <span>거래처 챗봇</span>
        </a>
      </div>
    </aside>
  );
}
