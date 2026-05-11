/**
 * Phase Next-Day28 (2026-05-11): /admin/internal — shadcn/ui.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';

export default function InternalPage() {
  const [rooms, setRooms] = useState<{ id: string; name: string | null }[]>([]);

  useEffect(() => {
    trpcCall<{ rooms: typeof rooms }>('rooms.list', { internal: true }).then((d) =>
      setRooms(d.rooms || []),
    );
  }, []);

  return (
    <div className="p-4 space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">🔐 관리자방</h1>
        <p className="text-xs text-gray-500 mt-0.5">모든 admin 자동 초대</p>
      </header>

      <Card>
        <CardContent className="px-0">
          {rooms.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-xs">
              관리자방이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rooms.map((r) => (
                <li key={r.id} className="px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors">
                  <p className="text-xs font-medium">{r.name || `방 ${r.id}`}</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">{r.id}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
