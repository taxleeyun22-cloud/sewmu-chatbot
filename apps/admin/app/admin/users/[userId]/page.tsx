/**
 * Phase 16 (2026-05-13) 사장님 명령 "옛으로 통일": /admin/users/[userId] → /admin.html#tab=users.
 * (옛 admin 의 거래처 dashboard 모달은 사용자 list 에서 클릭으로 진입)
 */
'use client';
export const runtime = 'edge';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
export default function Page() {
  const r = useRouter();
  const p = useParams();
  useEffect(() => {
    const uid = p?.userId;
    /* 옛 admin 에 user_id hash 전달 — admin.js 가 진입 시 hash 감지하면 자동으로 dashboard 모달 open */
    r.replace('/admin.html#tab=users&open_user=' + (uid || ''));
  }, [r, p]);
  return <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-500">거래처 dashboard 로 이동 중... <a href="/admin.html#tab=users" className="ml-2 underline">바로가기</a></div>;
}
