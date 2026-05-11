/**
 * Phase Next-Day28 (2026-05-11): /admin/rooms — shadcn/ui (split-view layout).
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Room {
  id: string;
  name: string | null;
  status: string | null;
  priority: number | null;
  ai_mode: string | null;
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    trpcCall<{ rooms: Room[] }>('rooms.list', { search }).then((d) => setRooms(d.rooms || []));
  }, [search]);

  return (
    <div className="flex h-full">
      {/* 좌측 — room list */}
      <aside className="w-72 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-2 border-b border-gray-200">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 상담방 검색"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-6">상담방이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rooms.map((r) => (
                <li
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    'px-2.5 py-1.5 cursor-pointer hover:bg-gray-50 transition-colors',
                    selectedId === r.id && 'bg-blue-50 border-l-2 border-l-brand-primary',
                  )}
                >
                  <p className="text-xs font-medium truncate">{r.name || '(이름없음)'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[10px] text-gray-500 font-mono truncate flex-1">{r.id}</p>
                    {r.ai_mode && <Badge variant="primary">AI</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* 우측 — room detail */}
      <main className="flex-1 flex flex-col bg-gray-50">
        {selectedId ? (
          <>
            <div className="px-4 py-2 border-b border-gray-200 bg-white">
              <h2 className="font-bold text-sm">방 #{selectedId}</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">Day 8+ 메시지 list 통합 예정</p>
            </div>
            <div className="flex-1 p-4 text-center text-gray-400 text-xs">
              Day 8 — rooms.get(roomId) + 메시지 list 본격 구현 예정
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
            상담방을 선택하세요
          </div>
        )}
      </main>
    </div>
  );
}
