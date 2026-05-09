import { describe, it, expect, beforeEach } from 'vitest';
import {
  setRoomsLoading,
  setRoomsList,
  setRoomsError,
  setRoomsMode,
  setRoomsSearch,
  setRoomsFilterSet,
  setCurrentRoomId,
  updateRoomInList,
  removeRoomFromList,
  resetRooms,
  getRooms,
  subscribeRooms,
  $filteredRooms,
  $totalUnread,
  initialRoomsState,
  type AdminRoom,
} from './rooms-store';

beforeEach(() => resetRooms());

const makeRoom = (id: string, opts: Partial<AdminRoom> = {}): AdminRoom => ({
  id,
  name: opts.name || `방${id}`,
  status: opts.status || 'active',
  ...opts,
});

describe('rooms-store', () => {
  it('초기 — mode normal / 빈 list', () => {
    expect(initialRoomsState.mode).toBe('normal');
    expect(initialRoomsState.rooms).toEqual([]);
    expect(initialRoomsState.lastFetchedAt).toBeNull();
  });

  it('setRoomsLoading + Error', () => {
    setRoomsLoading();
    expect(getRooms().loading).toBe(true);
    setRoomsError('서버 다운');
    expect(getRooms().error).toBe('서버 다운');
    expect(getRooms().loading).toBe(false);
  });

  it('setRoomsList — list + labels + lastFetchedAt', () => {
    setRoomsList([makeRoom('A'), makeRoom('B')], [{ id: 1, name: '예슬' }]);
    expect(getRooms().rooms.length).toBe(2);
    expect(getRooms().labels.length).toBe(1);
    expect(getRooms().lastFetchedAt).not.toBeNull();
  });

  it('setRoomsMode + setRoomsSearch + setRoomsFilterSet', () => {
    setRoomsMode('internal');
    setRoomsSearch('박승호');
    setRoomsFilterSet([1, 'closed']);
    const s = getRooms();
    expect(s.mode).toBe('internal');
    expect(s.searchQuery).toBe('박승호');
    expect(s.filterSet).toEqual([1, 'closed']);
  });

  it('setCurrentRoomId / updateRoomInList / removeRoomFromList', () => {
    setRoomsList([makeRoom('A'), makeRoom('B'), makeRoom('C')]);
    setCurrentRoomId('B');
    expect(getRooms().currentRoomId).toBe('B');
    updateRoomInList('A', { priority: 2, name: '새 이름' });
    expect(getRooms().rooms[0].priority).toBe(2);
    expect(getRooms().rooms[0].name).toBe('새 이름');
    removeRoomFromList('B');
    expect(getRooms().rooms.length).toBe(2);
    expect(getRooms().rooms.map((r) => r.id)).toEqual(['A', 'C']);
  });

  it('$filteredRooms — search 필터', () => {
    setRoomsList([
      makeRoom('A', { name: '박승호 방', last_msg_preview: '안녕' }),
      makeRoom('B', { name: '갑의 방', business_name: '주식회사 옆커폰' }),
      makeRoom('C', { name: 'C', first_member_name: '이동일' }),
    ]);
    expect($filteredRooms.get().length).toBe(3);
    setRoomsSearch('박승호');
    expect($filteredRooms.get().length).toBe(1);
    setRoomsSearch('옆커폰');
    expect($filteredRooms.get().length).toBe(1);
    setRoomsSearch('이동일');
    expect($filteredRooms.get().length).toBe(1);
    setRoomsSearch('');
    expect($filteredRooms.get().length).toBe(3);
  });

  it('$totalUnread — admin_unread_count 합계', () => {
    setRoomsList([
      makeRoom('A', { admin_unread_count: 3 }),
      makeRoom('B', { admin_unread_count: 0 }),
      makeRoom('C', { admin_unread_count: 5 }),
    ]);
    expect($totalUnread.get()).toBe(8);
  });

  it('subscribeRooms — 변경 알림', () => {
    let latest = getRooms();
    const unsub = subscribeRooms((s) => { latest = s; });
    setRoomsList([makeRoom('X')]);
    expect(latest.rooms.length).toBe(1);
    unsub();
  });

  it('window.__roomsStore global 노출', () => {
    expect(window.__roomsStore).toBeDefined();
    expect(typeof window.__roomsStore!.setList).toBe('function');
    expect(typeof window.__roomsStore!.setMode).toBe('function');
  });
});
