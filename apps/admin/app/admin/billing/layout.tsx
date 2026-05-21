/**
 * Phase D4 (2026-05-21): 청구서 시스템 — section layout.
 *
 * 사장님 명령: "구글식으로 업데이트". 새 admin (Next.js + tRPC + React Query) 진짜 페이지 부활 1호.
 * 옛 admin (/admin.html) 의 사이드바에서 진입 — 새 admin URL 로 새 탭.
 *
 * Sub-routes:
 *   /admin/billing          — 모아보기 (담당자 그룹)
 *   /admin/billing/template — 청구서 양식 (Template SSoT)
 *   /admin/billing/new      — 새 청구서 발행 (거래처/사업장 picker + 검토표 prefill)
 *   /admin/billing/[id]     — 청구서 상세
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export const runtime = 'edge';

export default function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/admin.html"
            className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
            title="옛 admin 으로"
          >
            ← admin
          </Link>
          <div className="text-base font-semibold text-gray-900">💰 청구서</div>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/admin/billing"
              className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-700"
            >
              모아보기
            </Link>
            <Link
              href="/admin/billing/new"
              className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-700"
            >
              + 새 청구서
            </Link>
            <Link
              href="/admin/billing/template"
              className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-700"
            >
              양식
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
