/**
 * Phase Next-Day28 (2026-05-11): /admin/rooms/[roomId] 상담방 메시지 — 카톡 UX.
 * 사장님 명령: "카톡 ux 전방위" — 메시지 buble 카톡 스타일.
 */
'use client';

export const runtime = 'edge';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    trpcCall<{ room: Room | null; messages: Message[] }>('rooms.get', { roomId })
      .then((d) => {
        if (cancelled) return;
        setRoom(d.room);
        setMessages(d.messages || []);
      })
      .catch((e) => toast.error(`방 로드 실패: ${e.message}`));
    /* 10초 polling — 옛 admin-rooms-list.js 패턴 */
    const t = setInterval(() => {
      trpcCall<{ messages: Message[] }>('rooms.get', { roomId })
        .then((d) => {
          if (!cancelled) setMessages(d.messages || []);
        })
        .catch(() => {});
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [roomId]);

  /* 새 메시지 도착 시 자동 스크롤 (카톡 UX) */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await trpcCall('rooms.send', { room_id: roomId, content: input });
      setInput('');
      const d = await trpcCall<{ messages: Message[] }>('rooms.get', { roomId });
      setMessages(d.messages || []);
    } catch (e) {
      toast.error(`전송 실패: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <header className="border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-2 bg-white shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/rooms">
            <Button size="sm" variant="ghost">←</Button>
          </Link>
          <div className="min-w-0">
            <h1 className="font-bold text-sm truncate">{room?.name || `방 ${roomId}`}</h1>
            <p className="text-[10px] text-gray-500 font-mono truncate">{roomId}</p>
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {room?.status && <Badge variant={room.status === 'active' ? 'success' : 'default'}>{room.status}</Badge>}
          <Button size="sm" variant="outline">📎 첨부</Button>
          <Button size="sm" variant={room?.status === 'active' ? 'destructive' : 'success'}>
            {room?.status === 'active' ? '종료' : '재개'}
          </Button>
        </div>
      </header>

      {/* 메시지 area — 카톡 스타일 */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto p-3 bg-[#b2c7d9]">
        <div className="space-y-2">
          {messages.length === 0 ? (
            <p className="text-center text-gray-600 py-8 text-xs">메시지 없음</p>
          ) : (
            messages.map((m) => {
              const isAdvisor = m.role === 'human_advisor';
              const isAI = m.role === 'assistant';
              const isMe = isAdvisor; // 사장님 메시지
              return (
                <div
                  key={m.id}
                  className={cn(
                    'flex items-end gap-1.5',
                    isMe ? 'justify-end' : 'justify-start',
                  )}
                >
                  {/* 상대방 아바타 */}
                  {!isMe && (
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                        isAI ? 'bg-gray-300 text-gray-700' : 'bg-yellow-300 text-gray-900',
                      )}
                    >
                      {isAI ? '🤖' : (m.real_name || m.name || '?')[0]}
                    </div>
                  )}
                  <div className={cn('flex flex-col max-w-[70%]', isMe ? 'items-end' : 'items-start')}>
                    {/* 상대방 이름 */}
                    {!isMe && (
                      <p className="text-[10px] text-gray-700 mb-0.5 px-1">
                        {isAI ? 'AI 어시스턴트' : m.real_name || m.name || '사용자'}
                      </p>
                    )}
                    <div className="flex items-end gap-1">
                      {/* 시간 (카톡 패턴: 내 메시지 → 왼쪽, 상대 메시지 → 오른쪽) */}
                      {isMe && (
                        <span className="text-[9px] text-gray-600 whitespace-nowrap mb-0.5">
                          {m.created_at?.slice(11, 16)}
                        </span>
                      )}
                      {/* 말풍선 */}
                      <div
                        className={cn(
                          'px-3 py-2 rounded-2xl text-xs leading-snug whitespace-pre-wrap break-words shadow-sm',
                          isMe
                            ? 'bg-[#fee500] text-gray-900 rounded-br-md'
                            : isAI
                              ? 'bg-white text-gray-900 rounded-bl-md'
                              : 'bg-white text-gray-900 rounded-bl-md',
                        )}
                      >
                        {m.content}
                      </div>
                      {!isMe && (
                        <span className="text-[9px] text-gray-600 whitespace-nowrap mb-0.5">
                          {m.created_at?.slice(11, 16)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* 입력 area — 카톡 스타일 */}
      <footer className="border-t border-gray-200 p-2 bg-white">
        <div className="flex gap-1.5 items-center">
          <Button size="icon" variant="ghost" title="첨부">📎</Button>
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="메시지 입력... (Enter 전송)"
            disabled={sending}
            className="flex-1 rounded-full h-9 px-3"
          />
          <Button onClick={send} disabled={sending || !input.trim()} className="rounded-full">
            {sending ? '...' : '전송'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
