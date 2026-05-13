/**
 * Phase 16 (2026-05-13) 사장님 명령 "옛으로 통일": /admin/businesses/[id] → /admin.html (업체 dashboard).
 */
'use client';
export const runtime = 'edge';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
export default function Page() {
  const r = useRouter();
  const p = useParams();
  useEffect(() => {
    const bid = p?.id;
    r.replace('/admin.html#tab=users&open_biz=' + (bid || ''));
  }, [r, p]);
  return <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-500">업체 화면으로 이동 중... <a href="/admin.html" className="ml-2 underline">바로가기</a></div>;
}
