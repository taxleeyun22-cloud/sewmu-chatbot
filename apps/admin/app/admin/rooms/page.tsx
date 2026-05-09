/**
 * Phase Next-Day7 (2026-05-09): /admin/rooms (tRPC 본격).
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
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 상담방 검색"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-12">
              상담방이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rooms.map((r) => (
                <li
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`p-3 cursor-pointer hover:bg-gray-50 ${
                    selectedId === r.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <p className="text-sm font-medium">{r.name || '(이름없음)'}</p>
                  <p className="text-xs text-gray-500 mt-1">{r.id}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedId ? (
          <>
            <div className="p-4 border-b border-gray-200 bg-white">
              <h2 className="font-bold">방 #{selectedId}</h2>
            </div>
            <div className="flex-1 p-4 text-center text-gray-400 text-sm">
              Day 8 — rooms.get(roomId) + 메시지 list 본격
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            상담방을 선택하세요
          </div>
        )}
      </div>
    </div>
  );
}
