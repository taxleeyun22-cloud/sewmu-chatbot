/**
 * Phase Next-Day28 (2026-05-11): /admin/rooms 컴팩트.
 * 사장님 명령: "새 어드민 컴팩트하게 변동 ㄱㄱ"
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

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
      <div className="w-64 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-2 border-b border-gray-200">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 상담방 검색"
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
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
                  className={`px-2 py-1.5 cursor-pointer hover:bg-gray-50 ${
                    selectedId === r.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <p className="text-xs font-medium truncate">{r.name || '(이름없음)'}</p>
                  <p className="text-[10px] text-gray-500 font-mono truncate">{r.id}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedId ? (
          <>
            <div className="px-3 py-2 border-b border-gray-200 bg-white">
              <h2 className="font-bold text-sm">방 #{selectedId}</h2>
            </div>
            <div className="flex-1 p-3 text-center text-gray-400 text-xs">
              Day 8 — rooms.get(roomId) + 메시지 list 본격
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
            상담방을 선택하세요
          </div>
        )}
      </div>
    </div>
  );
}
