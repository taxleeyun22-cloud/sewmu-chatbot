/**
 * Phase Next-Week4 (2026-05-09): 사이드바 (사장님 매일 워크플로).
 *
 * 기존 admin.html 사이드바 (라인 60-191) 마이그레이션.
 * 옛 디자인 그대로 + Next.js Link.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  icon: string;
  label: string;
  count?: number;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '방',
    items: [
      { href: '/admin/rooms', icon: '💬', label: '상담방' },
      { href: '/admin/internal', icon: '🔐', label: '관리자방' },
    ],
  },
  {
    title: '사용자/업체',
    items: [
      { href: '/admin/users', icon: '👤', label: '사용자' },
      { href: '/admin/businesses', icon: '🏢', label: '업체' },
    ],
  },
  {
    title: '문서·메모',
    items: [
      { href: '/admin/docs', icon: '📄', label: '문서' },
      { href: '/admin/memos', icon: '📒', label: '메모' },
    ],
  },
  {
    title: '관리',
    items: [
      { href: '/admin/dashboard', icon: '📊', label: '대시보드' },
      { href: '/admin/analytics', icon: '📈', label: '분석' },
      { href: '/admin/review', icon: '✓', label: '검증' },
      { href: '/admin/faq', icon: '📚', label: 'FAQ' },
      { href: '/admin/filings', icon: '📋', label: '신고 검토표' },
    ],
  },
  {
    title: '알림',
    items: [
      { href: '/admin/todos', icon: '📋', label: '내 일정' },
      { href: '/admin/term-req', icon: '⚠️', label: '종료 요청' },
      { href: '/admin/bulk-send', icon: '📢', label: '단체발송' },
      { href: '/admin/search', icon: '🔍', label: '전역 검색' },
      { href: '/admin/trash', icon: '🗑️', label: '휴지통' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-sb-bg border-r border-gray-200 flex flex-col">
      {/* 로고 / 사장님 */}
      <div className="px-4 py-5 border-b border-gray-200">
        <h1 className="font-bold text-gray-900">세무회계 이윤</h1>
        <p className="text-xs text-sb-text-mute mt-1">이재윤 대표세무사</p>
      </div>

      {/* 네비 */}
      <nav className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <h2 className="px-4 mb-1 text-xs font-medium text-sb-text-mute uppercase tracking-wide">
              {section.title}
            </h2>
            <ul>
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-sb-active-bg text-sb-active-text font-medium'
                          : 'text-sb-text hover:bg-gray-100'
                      }`}
                    >
                      <span className="w-5 text-center">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {typeof item.count === 'number' && item.count > 0 && (
                        <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                          {item.count}
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

      {/* 하단 — 사장님 정보 */}
      <div className="px-4 py-3 border-t border-gray-200 text-xs text-sb-text-mute">
        <a
          href="https://sewmu-chatbot.pages.dev"
          target="_blank"
          rel="noreferrer"
          className="hover:text-brand-primary"
        >
          → 거래처 챗봇
        </a>
      </div>
    </aside>
  );
}
