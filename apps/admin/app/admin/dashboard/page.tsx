/**
 * Phase 16 (2026-05-13) 사장님 명령 "옛으로 통일":
 * /admin/dashboard → /admin.html (옛 admin 메인 — 상담방 default 표시).
 *
 * 옛 admin 의 사이드바 + 거래처 list + 모달 모두 통일. 사장님 매일 워크플로 유지.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin.html');
  }, [router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center text-sm text-gray-500 dark:text-gray-400">
        <p>옛 admin 화면으로 이동 중...</p>
        <p className="mt-2 text-xs">
          <a href="/admin.html" className="text-brand-primary hover:underline">
            자동 이동 안 되면 클릭
          </a>
        </p>
      </div>
    </div>
  );
}
