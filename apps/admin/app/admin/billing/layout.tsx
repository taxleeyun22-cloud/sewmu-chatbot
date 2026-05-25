/**
 * Phase D4 (2026-05-21): 청구서 시스템 — section layout.
 *
 * 사장님 보고 (2026-05-21): "이게 원래 으리 프리뷰야??" — billing-preview.html 의 좌측
 * navy 사이드바 + 240px nav (조정료 청구 시스템 / 청구서 양식 / 청구서 모아보기 등) 그대로 포팅.
 *
 * Sub-routes:
 *   /admin/billing          — 청구서 모아보기 (담당자 그룹)
 *   /admin/billing/template — 청구서 양식 (Template SSoT)
 *   /admin/billing/new      — 새 청구서 발행 (거래처/사업장 picker + 검토표 prefill)
 *   /admin/billing/[id]     — 청구서 상세
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export const runtime = 'edge';

const NAV_SECTIONS: Array<{
  label: string;
  items: Array<{ href: string; icon: string; text: string; tag?: string }>;
}> = [
  {
    label: '조정료 청구 시스템',
    items: [
      { href: '/admin/billing/template', icon: '💼', text: '청구서 양식', tag: '템플릿' },
      { href: '/admin/billing', icon: '💰', text: '청구서 모아보기' },
    ],
  },
  {
    label: '개인 발행 (인스턴스)',
    items: [
      { href: '/admin/billing/new', icon: '✍️', text: '새 청구서 발행', tag: '+1건' },
    ],
  },
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
        active
          ? 'bg-blue-50 text-[#0B1F3A] font-bold'
          : 'text-gray-600 hover:bg-gray-100'
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

export default function BillingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';

  function isActive(href: string): boolean {
    if (href === '/admin/billing') {
      // 모아보기 = exact match (template/new/[id] 와 구분)
      return pathname === '/admin/billing' || pathname === '/admin/billing/';
    }
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <div className="flex min-h-screen bg-[#FAFAFA]">
      {/* 좌측 사이드바 — billing-preview.html .sb 톤 (navy 강조, 위하고 톤).
          사장님 보고 (2026-05-25): 인쇄 시 사이드바·헤더가 같이 나와 청구서 찌그러짐 → print:hidden. */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 sticky top-0 h-screen flex flex-col print:hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-[#0B1F3A] text-white font-bold text-sm flex items-center justify-center">
            이
          </span>
          <span className="text-sm font-bold text-gray-900 tracking-tight">
            세무회계 이윤
          </span>
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

      {/* 메인 — billing-preview.html .main 톤 (topbar + wrap) */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-7 py-3 flex items-center gap-3 print:hidden">
          <span className="text-sm text-gray-400">
            {pathname.includes('/template') && '청구서 양식'}
            {pathname.endsWith('/billing') && '청구서 모아보기'}
            {pathname.includes('/new') && '새 청구서 발행'}
            {pathname.match(/\/billing\/\d+$/) && '청구서 상세'}
          </span>
        </header>
        <main className="flex-1 px-6 py-5 max-w-[1500px] w-full mx-auto print:p-0 print:max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
