import { describe, it, expect, beforeEach } from 'vitest';
import {
  setBizRoomsLoading,
  setBizRoomsList,
  setBizRoomsError,
  resetBizRooms,
  getBizRooms,
  subscribeBizRooms,
  initialBizRoomsState,
  type BizRoom,
} from './biz-rooms-store';

beforeEach(() => resetBizRooms());

const makeRoom = (id: string, name?: string): BizRoom => ({
  id,
  name: name || `방${id}`,
  status: 'active',
});

describe('biz-rooms-store', () => {
  it('초기 — businessId null + 빈 list', () => {
    expect(initialBizRoomsState.businessId).toBeNull();
    expect(initialBizRoomsState.rooms).toEqual([]);
    expect(initialBizRoomsState.loading).toBe(false);
  });

  it('setBizRoomsLoading + setBizRoomsList', () => {
    setBizRoomsLoading(2);
    expect(getBizRooms().businessId).toBe(2);
    expect(getBizRooms().loading).toBe(true);
    setBizRoomsList(2, [makeRoom('A'), makeRoom('B')]);
    expect(getBizRooms().loading).toBe(false);
    expect(getBizRooms().rooms.length).toBe(2);
    expect(getBizRooms().lastFetchedAt).not.toBeNull();
  });

  it('setBizRoomsError', () => {
    setBizRoomsLoading(2);
    setBizRoomsError('서버 다운');
    expect(getBizRooms().loading).toBe(false);
    expect(getBizRooms().error).toBe('서버 다운');
  });

  it('resetBizRooms — 초기 상태 복구', () => {
    setBizRoomsList(5, [makeRoom('X')]);
    expect(getBizRooms().businessId).toBe(5);
    resetBizRooms();
    expect(getBizRooms().businessId).toBeNull();
    expect(getBizRooms().rooms).toEqual([]);
  });

  it('subscribeBizRooms — 변경 알림', () => {
    let latest = getBizRooms();
    const unsub = subscribeBizRooms((s) => { latest = s; });
    setBizRoomsList(7, [makeRoom('Z')]);
    expect(latest.businessId).toBe(7);
    expect(latest.rooms.length).toBe(1);
    unsub();
  });

  it('window.__bizRoomsStore global 노출', () => {
    expect(window.__bizRoomsStore).toBeDefined();
    expect(typeof window.__bizRoomsStore!.setList).toBe('function');
    expect(typeof window.__bizRoomsStore!.reset).toBe('function');
  });
});
