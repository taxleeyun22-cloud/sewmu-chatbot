import { describe, it, expect, beforeEach } from 'vitest';
import {
  setMessagesLoading,
  setMessagesData,
  setMessagesError,
  updateMessageInList,
  appendMessage,
  resetMessages,
  getMessages,
  subscribeMessages,
  initialMessagesState,
  type RoomMessage,
} from './messages-store';

beforeEach(() => resetMessages());

const makeMsg = (id: number, content = `msg${id}`): RoomMessage => ({
  id,
  content,
  role: 'user',
  created_at: new Date().toISOString(),
});

describe('messages-store', () => {
  it('초기 — roomId null + 빈 messages', () => {
    expect(initialMessagesState.roomId).toBeNull();
    expect(initialMessagesState.messages).toEqual([]);
    expect(initialMessagesState.loading).toBe(false);
  });

  it('setMessagesLoading + setMessagesData', () => {
    setMessagesLoading('R1');
    expect(getMessages().roomId).toBe('R1');
    expect(getMessages().loading).toBe(true);
    setMessagesData({
      roomId: 'R1',
      messages: [makeMsg(1), makeMsg(2)],
      members: [{ user_id: 64, real_name: '박승호' }],
      roomStatus: 'active',
      roomName: '박승호 방',
    });
    expect(getMessages().loading).toBe(false);
    expect(getMessages().messages.length).toBe(2);
    expect(getMessages().members.length).toBe(1);
    expect(getMessages().roomStatus).toBe('active');
    expect(getMessages().roomName).toBe('박승호 방');
    expect(getMessages().lastFetchedAt).not.toBeNull();
  });

  it('setMessagesError', () => {
    setMessagesError('서버 다운');
    expect(getMessages().error).toBe('서버 다운');
    expect(getMessages().loading).toBe(false);
  });

  it('updateMessageInList — 단건 update (삭제 처리 등)', () => {
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1), makeMsg(2), makeMsg(3)] });
    updateMessageInList(2, { deleted_at: '2026-05-08T00:00:00Z' });
    const m = getMessages().messages.find((x) => x.id === 2);
    expect(m?.deleted_at).toBe('2026-05-08T00:00:00Z');
    /* 다른 메시지 영향 0 */
    const m1 = getMessages().messages.find((x) => x.id === 1);
    expect(m1?.deleted_at).toBeUndefined();
  });

  it('appendMessage — 새 메시지 도착', () => {
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1)] });
    appendMessage(makeMsg(2, '새 메시지'));
    expect(getMessages().messages.length).toBe(2);
    expect(getMessages().messages[1].content).toBe('새 메시지');
  });

  it('resetMessages — 초기 상태 복구', () => {
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1)] });
    resetMessages();
    expect(getMessages().roomId).toBeNull();
    expect(getMessages().messages).toEqual([]);
  });

  it('subscribeMessages — 변경 알림', () => {
    let latest = getMessages();
    const unsub = subscribeMessages((s) => { latest = s; });
    setMessagesData({ roomId: 'R2', messages: [makeMsg(99)] });
    expect(latest.roomId).toBe('R2');
    expect(latest.messages.length).toBe(1);
    unsub();
  });

  it('window.__messagesStore global 노출', () => {
    expect(window.__messagesStore).toBeDefined();
    expect(typeof window.__messagesStore!.setData).toBe('function');
    expect(typeof window.__messagesStore!.appendMessage).toBe('function');
  });
});
