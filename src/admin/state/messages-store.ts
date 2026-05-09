/**
 * Phase 3.7 (2026-05-08): 상담방 메시지 list nanostore.
 *
 * admin-rooms-list.js loadRoomDetail 가 fetch 후 store 갱신 →
 * RoomMessages 컴포넌트 자동 reactive.
 *
 * 사장님 효과:
 *   - 새 메시지 도착 polling (10s) 시 store 갱신 → React 자동 re-render
 *   - 메시지 삭제·답장 후 새로고침 X
 */
import { atom } from 'nanostores';

/** 상담방 메시지 row */
export interface RoomMessage {
  id: number;
  user_id?: number | null;
  role?: string | null;
  real_name?: string | null;
  name?: string | null;
  content?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  unread_count?: number | null;
  document?: unknown;
  [key: string]: unknown;
}

export interface RoomMember {
  user_id?: number | null;
  real_name?: string | null;
  name?: string | null;
  role?: string | null;
  left_at?: string | null;
  [key: string]: unknown;
}

export interface MessagesState {
  /** 현재 표시 중인 방 ID */
  roomId: string | null;
  /** 메시지 list (시간순) */
  messages: RoomMessage[];
  /** 멤버 list */
  members: RoomMember[];
  /** 방 status */
  roomStatus: string | null;
  /** 방 이름 */
  roomName: string | null;
  /** 방 전화번호 */
  roomPhone: string | null;
  /** loading */
  loading: boolean;
  /** error */
  error: string | null;
  /** 마지막 fetch 시각 */
  lastFetchedAt: number | null;
}

export const initialMessagesState: MessagesState = {
  roomId: null,
  messages: [],
  members: [],
  roomStatus: null,
  roomName: null,
  roomPhone: null,
  loading: false,
  error: null,
  lastFetchedAt: null,
};

export const $messages = atom<MessagesState>({ ...initialMessagesState });

export function setMessagesLoading(roomId: string): void {
  $messages.set({ ...$messages.get(), roomId, loading: true, error: null });
}

export function setMessagesData(data: {
  roomId: string;
  messages: RoomMessage[];
  members?: RoomMember[];
  roomStatus?: string | null;
  roomName?: string | null;
  roomPhone?: string | null;
}): void {
  $messages.set({
    ...$messages.get(),
    roomId: data.roomId,
    messages: data.messages,
    members: data.members || $messages.get().members,
    roomStatus: data.roomStatus !== undefined ? data.roomStatus : $messages.get().roomStatus,
    roomName: data.roomName !== undefined ? data.roomName : $messages.get().roomName,
    roomPhone: data.roomPhone !== undefined ? data.roomPhone : $messages.get().roomPhone,
    loading: false,
    error: null,
    lastFetchedAt: Date.now(),
  });
}

export function setMessagesError(msg: string): void {
  $messages.set({ ...$messages.get(), loading: false, error: msg });
}

/** 단일 메시지 update (예: 삭제 처리) */
export function updateMessageInList(messageId: number, patch: Partial<RoomMessage>): void {
  const cur = $messages.get();
  $messages.set({
    ...cur,
    messages: cur.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
  });
}

/** 메시지 추가 (예: 새 메시지 도착) */
export function appendMessage(message: RoomMessage): void {
  const cur = $messages.get();
  $messages.set({ ...cur, messages: [...cur.messages, message] });
}

/**
 * Phase 3.8 (2026-05-08): 메시지 안 document 부분 patch.
 *
 * 영수증 승인/반려/되돌리기 후 message.document.status 등을
 * localized update — 전체 re-fetch 안 하고 그 메시지만 재렌더.
 *
 * 매칭: messages.find(m => m.document?.id === docId)
 */
export function updateMessageDoc(
  docId: number,
  docPatch: Record<string, unknown>,
): boolean {
  const cur = $messages.get();
  let found = false;
  const next = cur.messages.map((m) => {
    const doc = m.document as Record<string, unknown> | null | undefined;
    if (doc && doc.id === docId) {
      found = true;
      return { ...m, document: { ...doc, ...docPatch } };
    }
    return m;
  });
  if (found) {
    $messages.set({ ...cur, messages: next });
  }
  return found;
}

export function resetMessages(): void {
  $messages.set({ ...initialMessagesState });
}

export function getMessages(): MessagesState {
  return $messages.get();
}

export function subscribeMessages(cb: (s: MessagesState) => void): () => void {
  return $messages.subscribe(cb);
}

/* ============================================================
 * Global 노출 — admin-rooms-list.js (classic script) 호출용
 * ============================================================ */
export interface MessagesStoreGlobal {
  setLoading: (roomId: string) => void;
  setData: (data: {
    roomId: string;
    messages: RoomMessage[];
    members?: RoomMember[];
    roomStatus?: string | null;
    roomName?: string | null;
    roomPhone?: string | null;
  }) => void;
  setError: (msg: string) => void;
  updateMessage: (messageId: number, patch: Partial<RoomMessage>) => void;
  appendMessage: (message: RoomMessage) => void;
  /** Phase 3.8: 영수증 등 document 부분 patch (localized in-place update) */
  updateDoc: (docId: number, docPatch: Record<string, unknown>) => boolean;
  reset: () => void;
  get: () => MessagesState;
  subscribe: (cb: (s: MessagesState) => void) => () => void;
}

declare global {
  interface Window {
    __messagesStore?: MessagesStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__messagesStore = {
    setLoading: setMessagesLoading,
    setData: setMessagesData,
    setError: setMessagesError,
    updateMessage: updateMessageInList,
    appendMessage,
    updateDoc: updateMessageDoc,
    reset: resetMessages,
    get: getMessages,
    subscribe: subscribeMessages,
  };
}
