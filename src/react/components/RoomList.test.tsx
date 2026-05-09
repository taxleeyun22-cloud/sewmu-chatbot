/**
 * Phase 3.5.B (2026-05-08): RoomList 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { RoomList } from './RoomList';
import {
  resetRooms,
  setRoomsList,
  setRoomsLoading,
  setRoomsError,
  type AdminRoom,
} from '../../admin/state/rooms-store';

beforeEach(() => {
  resetRooms();
  /* mock — admin-rooms-list.js 의 _buildRoomListHtml 글로벌 노출 */
  window.__buildRoomListHtml = vi.fn(() => {
    return '<div class="room-list-mock">상담방 mock</div>';
  });
});

afterEach(() => {
  cleanup();
  delete window.__buildRoomListHtml;
});

const makeRoom = (id: string, name?: string): AdminRoom => ({
  id,
  name: name || `방${id}`,
  status: 'active',
});

describe('RoomList', () => {
  it('초기 — 빈 list 안내', () => {
    const { container } = render(<RoomList />);
    expect(container.textContent).toContain('상담방이 없습니다');
  });

  it('loading=true → 불러오는 중', () => {
    setRoomsLoading();
    const { container } = render(<RoomList />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('error → 오류 메시지', () => {
    setRoomsError('서버 다운');
    const { container } = render(<RoomList />);
    expect(container.textContent).toContain('오류: 서버 다운');
  });

  it('rooms 1개 → builder 호출 + mock html 표시', () => {
    setRoomsList([makeRoom('A', '박승호 방')]);
    const { container } = render(<RoomList />);
    expect(window.__buildRoomListHtml).toHaveBeenCalled();
    const mockEl = container.querySelector('.room-list-mock');
    expect(mockEl).toBeTruthy();
  });

  it('store update → 자동 re-render (builder 재호출)', () => {
    setRoomsList([makeRoom('A')]);
    const { container } = render(<RoomList />);
    expect(window.__buildRoomListHtml).toHaveBeenCalledTimes(1);
    act(() => {
      setRoomsList([makeRoom('B'), makeRoom('C')]);
    });
    /* React StrictMode 에서 effect 두번 호출 가능 → 최소 2번 */
    expect((window.__buildRoomListHtml as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.room-list-mock')).toBeTruthy();
  });

  it('__buildRoomListHtml 미로드 → fallback 메시지', () => {
    delete window.__buildRoomListHtml;
    setRoomsList([makeRoom('A')]);
    const { container } = render(<RoomList />);
    expect(container.textContent).toContain('빌더 미로드');
  });

  it('builder throw → 오류 메시지 표시', () => {
    window.__buildRoomListHtml = vi.fn(() => {
      throw new Error('빌드 실패');
    });
    setRoomsList([makeRoom('A')]);
    const { container } = render(<RoomList />);
    expect(container.textContent).toContain('렌더 실패: 빌드 실패');
  });
});
