/**
 * Phase Next-Day14 (2026-05-09): /admin/internal 관리자방.
 * 모든 admin 사용자가 공유하는 단일 채팅방.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

export default function InternalPage() {
  const [rooms, setRooms] = useState<{ id: string; name: string | null }[]>([]);

  useEffect(() => {
    trpcCall<{ rooms: typeof rooms }>('rooms.list', { internal: true }).then((d) =>
      setRooms(d.rooms || []),
    );
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">🔐 관리자방</h1>
      <div className="bg-white rounded-2xl p-6">
        {rooms.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">
            관리자방이 없습니다. (모든 admin 사용자 자동 초대)
          </p>
        ) : (
          <ul className="space-y-2">
            {rooms.map((r) => (
              <li
                key={r.id}
                className="p-4 border border-gray-200 rounded-xl hover:border-brand-primary cursor-pointer"
              >
                <p className="font-medium">{r.name || `방 ${r.id}`}</p>
                <p className="text-xs text-gray-500 mt-1">{r.id}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
