/**
 * Phase 16 (2026-05-13) 사장님 명령 "옛으로 통일": /admin/filings/[id] → /admin.html.
 * (옛 admin 의 신고 검토표는 사이드바 또는 모달 — 사장님이 직접 진입)
 */
'use client';
export const runtime = 'edge';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function Page() {
  const r = useRouter();
  useEffect(() => { r.replace('/admin.html'); }, [r]);
  return <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-500">신고 검토표 화면으로 이동 중... <a href="/admin.html" className="ml-2 underline">바로가기</a></div>;
}
