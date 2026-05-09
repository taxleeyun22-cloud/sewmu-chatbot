/**
 * Phase Next-Week4 (2026-05-09): admin layout.
 *
 * 사이드바 + 메인 영역 (사장님 매일 워크플로 핵심).
 * 기존 admin.html (1627줄) + admin.js (4500줄) 의 layout 부분 마이그레이션.
 */
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
