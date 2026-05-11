/**
 * Phase #3 후속 (2026-05-06): 상담방 API wrapper .ts.
 *
 * admin-rooms-list.js / admin-rooms-msg.js 의 fetch 호출들을 type-safe.
 *
 * 사용:
 *   import { fetchRoomList, fetchRoomDetail, sendRoomMessage } from '@/admin/rooms-api';
 */

interface ApiErrorResponse {
  ok: false;
  error: string;
}

function getKey(): string {
  if (typeof KEY === 'undefined') return '';
  return KEY || '';
}

async function safeJson<T>(r: Response): Promise<T | ApiErrorResponse> {
  try {
    return (await r.json()) as T | ApiErrorResponse;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ============================================================
 * 상담방 list / detail
 * ============================================================ */

export interface RoomListItem {
  id: string;
  name: string;
  status: 'active' | 'closed' | 'open';
  business_id: number | null;
  business_name: string | null;
  priority: number | null;
  unread: number;
  last_msg_preview: string | null;
  last_msg_at: string | null;
  ai_mode: 'on' | 'off';
}

export interface RoomListResponse {
  ok: true;
  rooms: RoomListItem[];
}

export async function fetchRoomList(
  internal: boolean = false,
): Promise<RoomListResponse | ApiErrorResponse> {
  const key = getKey();
  const url = `/api/admin-rooms?key=${encodeURIComponent(key)}${internal ? '&internal=1' : ''}`;
  const r = await fetch(url);
  return safeJson<RoomListResponse>(r);
}

export interface RoomMessage {
  id: number;
  room_id: string;
  user_id: number | null;
  role: 'user' | 'assistant' | 'admin' | 'human_advisor';
  content: string;
  attachments: string | null;
  created_at: string;
  display_name: string | null;
}

export interface RoomDetailResponse {
  ok: true;
  room: {
    id: string;
    name: string;
    status: string;
    business_id: number | null;
    business_name: string | null;
    phone: string | null;
    ai_mode: 'on' | 'off';
  };
  members: Array<{
    user_id: number;
    name: string;
    role: 'admin' | 'member';
    is_admin: 0 | 1;
    left_at: string | null;
  }>;
  messages: RoomMessage[];
}

export async function fetchRoomDetail(
  roomId: string,
): Promise<RoomDetailResponse | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(
    `/api/admin-rooms?key=${encodeURIComponent(key)}&room_id=${encodeURIComponent(roomId)}`,
  );
  return safeJson<RoomDetailResponse>(r);
}

/* ============================================================
 * 메시지 발송 / 액션
 * ============================================================ */

export async function sendRoomMessage(
  roomId: string,
  content: string,
  attachments?: Array<{ type: 'image' | 'file'; url: string; name?: string; size?: number }>,
): Promise<{ ok: true; message_id: number } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-rooms?key=${encodeURIComponent(key)}&action=send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, content, attachments }),
  });
  return safeJson<{ ok: true; message_id: number }>(r);
}

export async function closeRoom(roomId: string): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-rooms?key=${encodeURIComponent(key)}&action=close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId }),
  });
  return safeJson<{ ok: true }>(r);
}

export async function reopenRoom(roomId: string): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-rooms?key=${encodeURIComponent(key)}&action=reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId }),
  });
  return safeJson<{ ok: true }>(r);
}

export async function setRoomPriority(
  roomId: string,
  priority: number | null,
): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-rooms?key=${encodeURIComponent(key)}&action=set_priority`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, priority }),
  });
  return safeJson<{ ok: true }>(r);
}

export async function toggleAiMode(
  roomId: string,
  aiMode: 'on' | 'off',
): Promise<{ ok: true } | ApiErrorResponse> {
  const key = getKey();
  const r = await fetch(`/api/admin-rooms?key=${encodeURIComponent(key)}&action=toggle_ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, ai_mode: aiMode }),
  });
  return safeJson<{ ok: true }>(r);
}
