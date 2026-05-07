/**
 * rooms-api 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchRoomList,
  fetchRoomDetail,
  sendRoomMessage,
  closeRoom,
  reopenRoom,
  setRoomPriority,
  toggleAiMode,
} from './rooms-api';

let lastUrl = '';
let lastInit: RequestInit = {};
let mockResponse: unknown = { ok: true };

beforeEach(() => {
  lastUrl = '';
  lastInit = {};
  mockResponse = { ok: true };
  global.fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    lastUrl = String(url);
    lastInit = init || {};
    return { json: async () => mockResponse } as Response;
  }) as typeof fetch;
  (globalThis as Record<string, unknown>).KEY = 'TEST_KEY';
});

describe('fetchRoomList', () => {
  it('default — internal X', async () => {
    mockResponse = { ok: true, rooms: [] };
    await fetchRoomList();
    expect(lastUrl).toContain('admin-rooms');
    expect(lastUrl).toContain('key=TEST_KEY');
    expect(lastUrl).not.toContain('internal=1');
  });

  it('internal=true → internal=1', async () => {
    await fetchRoomList(true);
    expect(lastUrl).toContain('internal=1');
  });
});

describe('fetchRoomDetail', () => {
  it('room_id 인자', async () => {
    mockResponse = { ok: true, room: {}, members: [], messages: [] };
    await fetchRoomDetail('Z2HBV2');
    expect(lastUrl).toContain('room_id=Z2HBV2');
  });
});

describe('sendRoomMessage', () => {
  it('POST + content', async () => {
    mockResponse = { ok: true, message_id: 999 };
    await sendRoomMessage('R001', '테스트 메시지');
    expect(lastInit.method).toBe('POST');
    expect(lastUrl).toContain('action=send');
    expect(JSON.parse(String(lastInit.body))).toEqual({
      room_id: 'R001',
      content: '테스트 메시지',
      attachments: undefined,
    });
  });

  it('attachments 포함', async () => {
    await sendRoomMessage('R001', '본문', [
      { type: 'image', url: '/img.jpg' },
    ]);
    expect(JSON.parse(String(lastInit.body)).attachments).toHaveLength(1);
  });
});

describe('closeRoom / reopenRoom', () => {
  it('closeRoom — action=close', async () => {
    await closeRoom('R001');
    expect(lastUrl).toContain('action=close');
    expect(JSON.parse(String(lastInit.body))).toEqual({ room_id: 'R001' });
  });

  it('reopenRoom — action=reopen', async () => {
    await reopenRoom('R001');
    expect(lastUrl).toContain('action=reopen');
  });
});

describe('setRoomPriority', () => {
  it('priority + room_id', async () => {
    await setRoomPriority('R001', 1);
    expect(lastUrl).toContain('action=set_priority');
    expect(JSON.parse(String(lastInit.body))).toEqual({ room_id: 'R001', priority: 1 });
  });

  it('priority null (해제)', async () => {
    await setRoomPriority('R001', null);
    expect(JSON.parse(String(lastInit.body)).priority).toBeNull();
  });
});

describe('toggleAiMode', () => {
  it('on / off 둘 다', async () => {
    await toggleAiMode('R001', 'on');
    expect(JSON.parse(String(lastInit.body)).ai_mode).toBe('on');
    await toggleAiMode('R001', 'off');
    expect(JSON.parse(String(lastInit.body)).ai_mode).toBe('off');
  });
});
