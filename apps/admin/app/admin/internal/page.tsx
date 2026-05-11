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
    <div className="p-3">
      <h1 className="text-base font-bold text-gray-900 mb-2">🔐 관리자방</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {rooms.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-xs">
            관리자방이 없습니다. (모든 admin 사용자 자동 초대)
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rooms.map((r) => (
              <li
                key={r.id}
                className="px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                <p className="text-xs font-medium">{r.name || `방 ${r.id}`}</p>
                <p className="text-[10px] text-gray-500 font-mono">{r.id}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
