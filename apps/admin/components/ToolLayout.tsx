/**
 * ToolLayout — 새 admin "도구" 화면 공용 셸 (navy 사이드바 + 헤더 + 메인).
 *
 * billing-preview.html .sb 톤(navy 강조, 위하고 톤). 청구서·영업 타겟 등 공유.
 * (2026-06-04 영업 타겟 추가하며 billing/layout 에서 추출 — 사이드바 중복 제거.)
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_SECTIONS: Array<{
  label: string;
  items: Array<{ href: string; icon: string; text: string; tag?: string }>;
}> = [
  {
    label: '조정료 청구 시스템',
    items: [
      { href: '/admin/billing/template', icon: '💼', text: '청구서 양식', tag: '템플릿' },
      { href: '/admin/billing', icon: '💰', text: '청구서 모아보기' },
      { href: '/admin/billing/new', icon: '✍️', text: '새 청구서 발행' },
    ],
  },
  {
    label: '영업 도구',
    items: [{ href: '/admin/sales-targets', icon: '🎯', text: '영업 타겟', tag: 'NEW' }],
  },
];

const BREADCRUMBS: Array<{ match: (p: string) => boolean; label: string }> = [
  { match: (p) => p.includes('/template'), label: '청구서 양식' },
  { match: (p) => p.endsWith('/billing'), label: '청구서 모아보기' },
  { match: (p) => p.includes('/billing/new'), label: '새 청구서 발행' },
  { match: (p) => /\/billing\/\d+$/.test(p), label: '청구서 상세' },
  { match: (p) => p.includes('/sales-targets'), label: '영업 타겟' },
];

function NavItem({
  href,
  icon,
  text,
  tag,
  active,
}: {
  href: string;
  icon: string;
  text: string;
  tag?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
        active ? 'bg-blue-50 text-[#0B1F3A] font-bold' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="flex-1">{text}</span>
      {tag && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            active ? 'bg-[#0B1F3A] text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          {tag}
        </span>
      )}
    </Link>
  );
}

export function ToolLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';

  function isActive(href: string): boolean {
    if (href === '/admin/billing') {
      return pathname === '/admin/billing' || pathname === '/admin/billing/';
    }
    return pathname === href || pathname.startsWith(href + '/');
  }
  const crumb = BREADCRUMBS.find((b) => b.match(pathname))?.label || '';

  return (
    <div className="flex min-h-screen bg-[#FAFAFA]">
      <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 sticky top-0 h-screen flex flex-col print:hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-[#0B1F3A] text-white font-bold text-sm flex items-center justify-center">
            이
          </span>
          <span className="text-sm font-bold text-gray-900 tracking-tight">세무회계 이윤</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          <Link
            href="/admin.html"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 mb-2"
            title="옛 admin 으로 돌아가기"
          >
            ← admin 메인
          </Link>

          {NAV_SECTIONS.map((sec) => (
            <div key={sec.label} className="mt-2">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">
                {sec.label}
              </div>
              <div className="space-y-0.5">
                {sec.items.map((it) => (
                  <NavItem key={it.href} {...it} active={isActive(it.href)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2.5 text-xs">
          <span className="w-7 h-7 rounded-full bg-blue-50 text-[#0B1F3A] font-bold flex items-center justify-center">
            이
          </span>
          <div className="min-w-0">
            <div className="font-bold text-gray-900 text-[13px]">이재윤 사장님</div>
            <div className="text-gray-400 text-[10px]">owner · 4직원 관리자</div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-7 py-3 flex items-center gap-3 print:hidden">
          <span className="text-sm text-gray-400">{crumb}</span>
        </header>
        <main className="flex-1 px-6 py-5 max-w-[1500px] w-full mx-auto print:p-0 print:max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
