/**
 * Phase Next-Day8 (2026-05-09): /admin/rooms/[roomId] 메시지 영역.
 */
'use client';

export const runtime = 'edge';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';

interface Message {
  id: number;
  role: string;
  content: string;
  created_at: string | null;
  real_name?: string | null;
  name?: string | null;
}

interface Room {
  id: string;
  name: string | null;
  status: string | null;
}

export default function RoomDetailPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    trpcCall<{ room: Room | null; messages: Message[] }>('rooms.get', { roomId })
      .then((d) => {
        if (cancelled) return;
        setRoom(d.room);
        setMessages(d.messages || []);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await trpcCall('rooms.send', { room_id: roomId, content: input });
      setInput('');
      // 재 fetch
      const d = await trpcCall<{ messages: Message[] }>('rooms.get', { roomId });
      setMessages(d.messages || []);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <Link href="/admin/rooms" className="text-brand-primary text-sm">
            ← 상담방 list
          </Link>
          <h1 className="font-bold text-lg mt-1">
            {room?.name || `방 #${roomId}`}
          </h1>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-sm bg-gray-100 rounded">팝아웃</button>
          <button className="px-3 py-1.5 text-sm bg-gray-100 rounded">
            {room?.status === 'active' ? '종료' : '재개'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">메시지 없음</p>
          ) : (
            messages.map((m) => {
              const isAdvisor = m.role === 'human_advisor';
              return (
                <div
                  key={m.id}
                  className={`flex ${isAdvisor ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                      isAdvisor
                        ? 'bg-green-500 text-white'
                        : m.role === 'assistant'
                          ? 'bg-gray-100 text-gray-900'
                          : 'bg-white border border-gray-200'
                    }`}
                  >
                    <p className="text-xs opacity-75 mb-1">
                      {isAdvisor
                        ? '👨‍💼 세무사'
                        : m.role === 'assistant'
                          ? '🤖 AI'
                          : m.real_name || m.name || '사용자'}
                    </p>
                    {m.content}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      <footer className="border-t border-gray-200 p-3 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="메시지를 입력하세요..."
            disabled={sending}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="bg-brand-primary text-white px-5 py-2 rounded-full font-medium disabled:opacity-50"
          >
            전송
          </button>
        </div>
      </footer>
    </div>
  );
}
