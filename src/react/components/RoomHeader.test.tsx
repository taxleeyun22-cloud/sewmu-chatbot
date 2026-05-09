/**
 * Phase 3.9 (2026-05-09): RoomHeader (Title/Status/Members) 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { RoomChatTitle, RoomStatusBtn, RoomMembers } from './RoomHeader';
import {
  resetMessages,
  setMessagesData,
  type RoomMember,
} from '../../admin/state/messages-store';

beforeEach(() => {
  resetMessages();
});

afterEach(() => {
  cleanup();
});

const makeMember = (uid: number, name: string, role = 'user', left = false): RoomMember => ({
  user_id: uid,
  real_name: name,
  name,
  role,
  left_at: left ? '2026-05-08' : null,
});

describe('RoomChatTitle', () => {
  it('roomId 없음 → "좌측 상담방을 선택하세요"', () => {
    const { container } = render(<RoomChatTitle />);
    expect(container.textContent).toContain('좌측 상담방을 선택하세요');
  });

  it('roomId + roomName 표시', () => {
    setMessagesData({ roomId: 'ABC123', messages: [], roomName: '박승호 방' });
    const { container } = render(<RoomChatTitle />);
    expect(container.textContent).toContain('박승호 방');
    expect(container.textContent).toContain('ABC123');
  });

  it('roomName 없으면 "상담방" 기본값', () => {
    setMessagesData({ roomId: 'X', messages: [] });
    const { container } = render(<RoomChatTitle />);
    expect(container.textContent).toContain('상담방');
  });

  it('store update → 자동 re-render', () => {
    setMessagesData({ roomId: 'A', messages: [], roomName: '첫방' });
    const { container } = render(<RoomChatTitle />);
    expect(container.textContent).toContain('첫방');
    act(() => {
      setMessagesData({ roomId: 'B', messages: [], roomName: '두번째방' });
    });
    expect(container.textContent).toContain('두번째방');
    expect(container.textContent).not.toContain('첫방');
  });
});

describe('RoomStatusBtn', () => {
  it('roomStatus=active → "종료" 라벨 텍스트', () => {
    setMessagesData({ roomId: 'X', messages: [], roomStatus: 'active' });
    const { container } = render(<RoomStatusBtn />);
    expect(container.textContent).toBe('종료');
  });

  it('roomStatus=closed → "재개" 라벨 텍스트', () => {
    setMessagesData({ roomId: 'X', messages: [], roomStatus: 'closed' });
    const { container } = render(<RoomStatusBtn />);
    expect(container.textContent).toBe('재개');
  });

  it('store update → 자동 라벨 변경', () => {
    setMessagesData({ roomId: 'X', messages: [], roomStatus: 'active' });
    const { container } = render(<RoomStatusBtn />);
    expect(container.textContent).toBe('종료');
    act(() => {
      setMessagesData({ roomId: 'X', messages: [], roomStatus: 'closed' });
    });
    expect(container.textContent).toBe('재개');
  });
});

describe('RoomMembers', () => {
  it('roomId 없음 → null (렌더 0)', () => {
    const { container } = render(<RoomMembers />);
    expect(container.firstChild).toBeNull();
  });

  it('멤버 list — left_at 없는 사람만 표시', () => {
    setMessagesData({
      roomId: 'X',
      messages: [],
      members: [
        makeMember(64, '박승호'),
        makeMember(99, '관리자', 'admin'),
        makeMember(100, '나간사람', 'user', true),
      ],
    });
    const { container } = render(<RoomMembers />);
    expect(container.textContent).toContain('박승호');
    expect(container.textContent).toContain('관리자(관리)');
    expect(container.textContent).not.toContain('나간사람');
    expect(container.textContent).toContain('세무회계 이윤');
  });

  it('admin role 은 long-press span 없이 단순 텍스트 + (관리)', () => {
    setMessagesData({
      roomId: 'X',
      messages: [],
      members: [makeMember(99, '예슬', 'admin')],
    });
    const { container } = render(<RoomMembers />);
    expect(container.querySelector('.room-member')).toBeNull();
    expect(container.textContent).toContain('예슬(관리)');
  });

  it('non-admin 은 .room-member span + data-uid + data-name', () => {
    setMessagesData({
      roomId: 'X',
      messages: [],
      members: [makeMember(64, '박승호')],
    });
    const { container } = render(<RoomMembers />);
    const span = container.querySelector('.room-member');
    expect(span).toBeTruthy();
    expect(span?.getAttribute('data-uid')).toBe('64');
    expect(span?.getAttribute('data-name')).toBe('박승호');
  });
});
