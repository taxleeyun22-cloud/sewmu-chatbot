/**
 * Phase 16 (2026-05-13) 사장님 명령 "옛으로 통일": /admin/rooms/[roomId] → /admin.html#tab=rooms.
 */
'use client';
export const runtime = 'edge';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
export default function Page() {
  const r = useRouter();
  const p = useParams();
  useEffect(() => {
    const rid = p?.roomId;
    r.replace('/admin.html#tab=rooms&open_room=' + (rid || ''));
  }, [r, p]);
  return <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-500">상담방으로 이동 중... <a href="/admin.html#tab=rooms" className="ml-2 underline">바로가기</a></div>;
}
