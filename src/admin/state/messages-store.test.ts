import { describe, it, expect, beforeEach } from 'vitest';
import {
  setMessagesLoading,
  setMessagesData,
  setMessagesError,
  updateMessageInList,
  appendMessage,
  updateMessageDoc,
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
    expect(typeof window.__messagesStore!.updateDoc).toBe('function');
  });

  /* Phase 3.8 (2026-05-08): updateMessageDoc — 영수증 승인 후 localized in-place update */
  it('updateMessageDoc — 메시지 안 document 부분 patch (status 변경)', () => {
    const msg1: RoomMessage = {
      id: 1,
      content: 'photo',
      role: 'user',
      document: { id: 100, status: 'pending', vendor: '편의점', amount: 5000 },
    };
    const msg2: RoomMessage = {
      id: 2,
      content: 'text',
      role: 'human_advisor',
    };
    setMessagesData({ roomId: 'R1', messages: [msg1, msg2] });
    const ok = updateMessageDoc(100, { status: 'approved', amount: 5500 });
    expect(ok).toBe(true);
    const m1 = getMessages().messages.find((x) => x.id === 1);
    const doc = m1?.document as Record<string, unknown>;
    expect(doc.status).toBe('approved');
    expect(doc.amount).toBe(5500);
    expect(doc.vendor).toBe('편의점'); // 기존 유지
  });

  it('updateMessageDoc — 매칭 doc 없으면 false 반환 + 변경 0', () => {
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1)] });
    const ok = updateMessageDoc(999, { status: 'approved' });
    expect(ok).toBe(false);
  });

  it('updateMessageDoc — 다른 메시지 영향 0', () => {
    const msg1: RoomMessage = {
      id: 1,
      content: 'photo',
      role: 'user',
      document: { id: 100, status: 'pending' },
    };
    const msg2: RoomMessage = {
      id: 2,
      content: 'photo2',
      role: 'user',
      document: { id: 200, status: 'pending' },
    };
    setMessagesData({ roomId: 'R1', messages: [msg1, msg2] });
    updateMessageDoc(100, { status: 'approved' });
    const m2 = getMessages().messages.find((x) => x.id === 2);
    const doc2 = m2?.document as Record<string, unknown>;
    expect(doc2.status).toBe('pending'); // 변경 X
  });
});
