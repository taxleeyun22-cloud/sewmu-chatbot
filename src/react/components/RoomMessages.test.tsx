/**
 * Phase 3.7 (2026-05-08): RoomMessages 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { RoomMessages } from './RoomMessages';
import {
  resetMessages,
  setMessagesData,
  setMessagesLoading,
  setMessagesError,
  appendMessage,
  type RoomMessage,
} from '../../admin/state/messages-store';

beforeEach(() => {
  resetMessages();
  window.__buildRoomMessagesHtml = vi.fn(() => {
    return '<div class="msg-mock">메시지 mock</div>';
  });
});

afterEach(() => {
  cleanup();
  delete window.__buildRoomMessagesHtml;
});

const makeMsg = (id: number, content = `msg${id}`): RoomMessage => ({
  id,
  content,
  role: 'user',
  created_at: '2026-05-08T10:00:00Z',
});

describe('RoomMessages', () => {
  it('초기 — 빈 list 안내 ("새 상담방")', () => {
    const { container } = render(<RoomMessages />);
    expect(container.textContent).toContain('새 상담방');
  });

  it('loading + 빈 list → 불러오는 중', () => {
    setMessagesLoading('R1');
    const { container } = render(<RoomMessages />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('error → 오류 + 재시도 버튼', () => {
    setMessagesError('서버 다운');
    const { container } = render(<RoomMessages />);
    expect(container.textContent).toContain('서버 다운');
    expect(container.textContent).toContain('🔄 재시도');
  });

  it('messages 1개 → builder 호출 + mock html 표시', () => {
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1, '안녕')] });
    const { container } = render(<RoomMessages />);
    expect(window.__buildRoomMessagesHtml).toHaveBeenCalled();
    const mockEl = container.querySelector('.msg-mock');
    expect(mockEl).toBeTruthy();
  });

  it('appendMessage → 자동 re-render', () => {
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1, '첫 메시지')] });
    const { container } = render(<RoomMessages />);
    const initialCalls = (window.__buildRoomMessagesHtml as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      appendMessage(makeMsg(2, '두번째'));
    });
    expect((window.__buildRoomMessagesHtml as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCalls);
    expect(container.querySelector('.msg-mock')).toBeTruthy();
  });

  it('__buildRoomMessagesHtml 미로드 → fallback 메시지', () => {
    delete window.__buildRoomMessagesHtml;
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1)] });
    const { container } = render(<RoomMessages />);
    expect(container.textContent).toContain('빌더 미로드');
  });

  it('builder throw → 에러 메시지', () => {
    window.__buildRoomMessagesHtml = vi.fn(() => {
      throw new Error('빌드 실패');
    });
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1)] });
    const { container } = render(<RoomMessages />);
    expect(container.textContent).toContain('렌더 실패: 빌드 실패');
  });

  it('roomId 변경 → builder 재호출 (다른 방 진입)', () => {
    setMessagesData({ roomId: 'R1', messages: [makeMsg(1)] });
    render(<RoomMessages />);
    const callsBefore = (window.__buildRoomMessagesHtml as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      setMessagesData({ roomId: 'R2', messages: [makeMsg(99)] });
    });
    expect((window.__buildRoomMessagesHtml as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
