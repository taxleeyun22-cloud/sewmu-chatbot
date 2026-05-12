/**
 * Phase Next-Week4 (2026-05-09) + Phase 11 (2026-05-12): admin layout.
 *
 * 사이드바 + 메인 영역 + 모바일 햄버거.
 * - md+ (≥768px): 고정 사이드바
 * - md 미만: 햄버거 버튼 → drawer
 */
'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Menu } from 'lucide-react';

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {/* 모바일 햄버거 — md 이상에서 hide */}
        <div className="md:hidden sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={mobileOpen}
            className="p-1.5 -ml-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary text-gray-700 dark:text-gray-200"
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">세무회계 이윤</span>
        </div>
        {children}
      </main>
    </div>
  );
}
