/**
 * Phase 3.1.A (2026-05-08): users-store 단위 테스트.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  $users,
  $usersCount,
  setUsersList,
  setUsersLoading,
  setUsersError,
  removeUserFromList,
  updateUserInList,
  resetUsers,
  getUsers,
  subscribeUsers,
  initialUsersState,
  type AdminUser,
} from './users-store';

beforeEach(() => {
  resetUsers();
});

const makeUser = (id: number, status = 'pending'): AdminUser => ({
  id,
  real_name: `user${id}`,
  name: `user${id}`,
  approval_status: status,
  is_admin: 0,
});

describe('users-store', () => {
  it('initialUsersState — currentStatus pending / 빈 배열', () => {
    expect(initialUsersState.currentStatus).toBe('pending');
    expect(initialUsersState.users).toEqual([]);
    expect(initialUsersState.lastFetchedAt).toBeNull();
    expect(initialUsersState.loading).toBe(false);
    expect(initialUsersState.error).toBeNull();
  });

  it('setUsersList — status + users + counts 갱신', () => {
    const users = [makeUser(1), makeUser(2)];
    setUsersList('approved_client', users, { approved_client: 2 });
    const s = getUsers();
    expect(s.currentStatus).toBe('approved_client');
    expect(s.users.length).toBe(2);
    expect(s.counts.approved_client).toBe(2);
    expect(s.lastFetchedAt).not.toBeNull();
    expect(s.loading).toBe(false);
  });

  it('setUsersLoading — loading=true / status 변경', () => {
    setUsersLoading('admin');
    const s = getUsers();
    expect(s.loading).toBe(true);
    expect(s.currentStatus).toBe('admin');
    expect(s.error).toBeNull();
  });

  it('setUsersError — error msg + loading=false', () => {
    setUsersLoading('pending');
    setUsersError('서버 오류');
    const s = getUsers();
    expect(s.error).toBe('서버 오류');
    expect(s.loading).toBe(false);
  });

  it('removeUserFromList — 특정 user 제거', () => {
    setUsersList('pending', [makeUser(1), makeUser(2), makeUser(3)]);
    removeUserFromList(2);
    const s = getUsers();
    expect(s.users.length).toBe(2);
    expect(s.users.map(u => u.id)).toEqual([1, 3]);
  });

  it('removeUserFromList — 없는 ID 도 안전', () => {
    setUsersList('pending', [makeUser(1), makeUser(2)]);
    removeUserFromList(999);
    const s = getUsers();
    expect(s.users.length).toBe(2);
  });

  it('updateUserInList — 특정 user 부분 update', () => {
    setUsersList('pending', [makeUser(1), makeUser(2)]);
    updateUserInList(1, { approval_status: 'approved_client', name_confirmed: 1 });
    const s = getUsers();
    expect(s.users[0].approval_status).toBe('approved_client');
    expect(s.users[0].name_confirmed).toBe(1);
    expect(s.users[1].approval_status).toBe('pending');
  });

  it('resetUsers — 모든 값 초기화', () => {
    setUsersList('admin', [makeUser(1)]);
    resetUsers();
    expect(getUsers().users).toEqual([]);
    expect(getUsers().currentStatus).toBe('pending');
    expect(getUsers().lastFetchedAt).toBeNull();
  });

  it('subscribeUsers — 변경 알림', () => {
    let latest = getUsers();
    const unsub = subscribeUsers((s) => {
      latest = s;
    });
    setUsersList('admin', [makeUser(7)]);
    expect(latest.currentStatus).toBe('admin');
    expect(latest.users[0].id).toBe(7);
    unsub();
  });

  it('$usersCount computed — users.length 자동 반영', () => {
    expect($usersCount.get()).toBe(0);
    setUsersList('pending', [makeUser(1), makeUser(2), makeUser(3)]);
    expect($usersCount.get()).toBe(3);
    removeUserFromList(2);
    expect($usersCount.get()).toBe(2);
  });

  it('window.__usersStore global 노출', () => {
    expect(window.__usersStore).toBeDefined();
    expect(typeof window.__usersStore!.setList).toBe('function');
    expect(typeof window.__usersStore!.removeUser).toBe('function');
    expect(typeof window.__usersStore!.updateUser).toBe('function');
    expect(typeof window.__usersStore!.get).toBe('function');
  });

  it('window.__usersStore.setList 호출 — atom 갱신', () => {
    window.__usersStore!.setList('rejected', [makeUser(99)]);
    expect(getUsers().currentStatus).toBe('rejected');
    expect(getUsers().users[0].id).toBe(99);
  });

  it('window.__usersStore.removeUser — atom 갱신', () => {
    setUsersList('pending', [makeUser(1), makeUser(2)]);
    window.__usersStore!.removeUser(1);
    expect(getUsers().users.length).toBe(1);
    expect(getUsers().users[0].id).toBe(2);
  });
});
