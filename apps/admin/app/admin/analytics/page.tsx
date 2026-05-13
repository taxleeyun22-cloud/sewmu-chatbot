/**
 * Phase 16 (2026-05-13) 사장님 명령 "옛으로 통일": /admin/analytics → /admin.html#tab=anal.
 */
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function Page() {
  const r = useRouter();
  useEffect(() => { r.replace('/admin.html#tab=anal'); }, [r]);
  return <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-500">옛 admin 화면으로 이동 중... <a href="/admin.html#tab=anal" className="ml-2 underline">바로가기</a></div>;
}
