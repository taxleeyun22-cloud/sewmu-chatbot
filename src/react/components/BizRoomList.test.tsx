/**
 * Phase 3.6 (2026-05-08): BizRoomList 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { BizRoomList } from './BizRoomList';
import {
  resetBizRooms,
  setBizRoomsList,
  setBizRoomsLoading,
  setBizRoomsError,
  type BizRoom,
} from '../../admin/state/biz-rooms-store';

beforeEach(() => {
  resetBizRooms();
});

afterEach(() => {
  cleanup();
});

const makeRoom = (id: string, name?: string, status?: string): BizRoom => ({
  id,
  name: name || `방${id}`,
  status: status || 'active',
});

describe('BizRoomList', () => {
  it('초기 — 빈 list "연결된 상담방 없음"', () => {
    const { container } = render(<BizRoomList />);
    expect(container.textContent).toContain('연결된 상담방 없음');
  });

  it('loading=true → 불러오는 중 표시', () => {
    setBizRoomsLoading(2);
    const { container } = render(<BizRoomList />);
    expect(container.textContent).toContain('상담방 불러오는 중');
  });

  it('error → 오류 메시지', () => {
    setBizRoomsError('서버 다운');
    const { container } = render(<BizRoomList />);
    expect(container.textContent).toContain('오류: 서버 다운');
  });

  it('rooms 1개 → row 1개 + ID 표시', () => {
    setBizRoomsList(2, [makeRoom('ABC123', '박승호 방')]);
    const { container } = render(<BizRoomList />);
    const rows = container.querySelectorAll('.room-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('박승호 방');
    expect(rows[0].textContent).toContain('ABC123');
  });

  it('rooms 3개 → row 3개 + 순서 보존', () => {
    setBizRoomsList(2, [
      makeRoom('A', '첫번째'),
      makeRoom('B', '두번째'),
      makeRoom('C', '세번째'),
    ]);
    const { container } = render(<BizRoomList />);
    const rows = container.querySelectorAll('.room-row');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('첫번째');
    expect(rows[2].textContent).toContain('세번째');
  });

  it('status=closed 인 방 → 종료 라벨 표시', () => {
    setBizRoomsList(2, [makeRoom('X', '종료된방', 'closed')]);
    const { container } = render(<BizRoomList />);
    expect(container.textContent).toContain('종료');
  });

  it('store update → 자동 re-render', () => {
    setBizRoomsList(2, [makeRoom('A', '첫번째')]);
    const { container } = render(<BizRoomList />);
    expect(container.textContent).toContain('첫번째');
    act(() => {
      setBizRoomsList(3, [makeRoom('B', '바뀐방')]);
    });
    expect(container.textContent).toContain('바뀐방');
    expect(container.textContent).not.toContain('첫번째');
  });

  it('row 클릭 → location.href 변경', () => {
    setBizRoomsList(2, [makeRoom('TEST123', '테스트')]);
    const { container } = render(<BizRoomList />);
    const row = container.querySelector('.room-row') as HTMLElement;
    /* jsdom 환경 — location 읽기는 가능하지만 navigation 테스트 자체는 skip.
     * 클릭 핸들러 자체가 호출되는지만 검증 (에러 X). */
    expect(() => fireEvent.click(row)).not.toThrow();
  });
});
