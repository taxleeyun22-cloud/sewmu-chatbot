/**
 * Phase Next-Day28 (2026-05-11) + Phase 11 cleanup (2026-05-12):
 * Sidebar — lucide-react + React Query + 모바일 drawer.
 *
 * 구글직원 패턴:
 * - md+ (≥768px): 고정 사이드바 (w-52)
 * - md 미만 (모바일): drawer 형태 — `open` prop 으로 열고 닫음
 * - confirm() → ConfirmDialog (Phase 11)
 *
 * 사용:
 *   <Sidebar mobileOpen={open} onMobileClose={() => setOpen(false)} />
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { badgeClass, type CountKey } from './sidebar-badge';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { confirm } from '@/components/ui/confirm-dialog';
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
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect } from 'react';

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

export interface SidebarProps {
  /** 모바일 drawer 열림 상태 */
  mobileOpen?: boolean;
  /** drawer 닫기 콜백 */
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps = {}) {
  const pathname = usePathname();

  const { data: counts } = useQuery<DashboardCounts>({
    queryKey: ['dashboard.counts'],
    queryFn: () => trpcCall<DashboardCounts>('dashboard.counts'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  /* 모바일 drawer 열렸을 때 — body scroll lock + ESC 닫기 */
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onMobileClose) onMobileClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  /* 모바일 — pathname 바뀌면 자동 닫기 (라우팅 후 drawer 사라짐) */
  useEffect(() => {
    if (mobileOpen && onMobileClose) onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleLogout() {
    const ok = await confirm({
      title: '로그아웃',
      description: '로그아웃 하시겠습니까?',
      confirmText: '로그아웃',
    });
    if (!ok) return;
    try {
      await fetch('/api/admin-logout', { method: 'POST' });
    } catch {
      /* network 오류 — 어차피 redirect 로 강제 */
    }
    window.location.href = '/login';
  }

  const aside = (
    <aside
      className={cn(
        'w-52 bg-sb-bg border-r border-gray-200 flex flex-col h-full',
        /* 데스크탑 (md+): 인라인 / 모바일: drawer */
        'md:static md:translate-x-0',
        mobileOpen
          ? 'fixed top-0 left-0 z-50 translate-x-0 shadow-2xl'
          : 'fixed top-0 left-0 z-50 -translate-x-full',
        'transition-transform duration-200 ease-out',
      )}
      aria-label="네비게이션"
    >
      {/* 로고 영역 — 모바일 drawer 면 닫기 X 도 같이 */}
      <div className="px-3 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
        <Avatar name="세" variant="primary" size="sm" />
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 text-xs truncate">세무회계 이윤</h1>
          <p className="text-[10px] text-sb-text-mute truncate">이재윤 대표세무사</p>
        </div>
        {onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="메뉴 닫기"
            className="md:hidden p-1 -mr-1 rounded hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        )}
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
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-1.5 text-[13px] leading-tight transition-all',
                        /* 터치 타깃 — 모바일 ≥40px 권장. 폰트 13px + py-1.5 (12px) + line-height tight ≈ 36px.
                         * 모바일 살짝 키워 보장 */
                        'md:py-1.5 py-2',
                        active
                          ? 'bg-sb-active-bg text-sb-active-text font-medium border-l-2 border-l-brand-primary'
                          : 'text-sb-text hover:bg-white hover:text-gray-900 border-l-2 border-l-transparent',
                      )}
                    >
                      <Icon size={14} className="flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={cn('text-[10px] px-1 py-0 rounded-full leading-4 font-medium', cls)}
                          data-testid={`badge-${item.countKey}`}
                          aria-label={`${item.label} ${count}건`}
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
          type="button"
          onClick={handleLogout}
          className="w-full text-left text-[11px] text-gray-600 hover:text-red-600 flex items-center gap-1.5 py-1 rounded hover:bg-red-50 px-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <LogOut size={12} strokeWidth={1.8} aria-hidden="true" />
          <span>로그아웃</span>
        </button>
        <a
          href="https://sewmu-chatbot.pages.dev"
          target="_blank"
          rel="noreferrer"
          className="w-full text-[11px] text-gray-600 hover:text-brand-primary flex items-center gap-1.5 py-1 rounded hover:bg-blue-50 px-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
          <span>거래처 챗봇</span>
        </a>
      </div>
    </aside>
  );

  return (
    <>
      {/* 모바일 backdrop — drawer 열렸을 때만 */}
      {mobileOpen && onMobileClose && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      {aside}
    </>
  );
}
