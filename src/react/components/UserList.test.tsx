/**
 * Phase 3.1.B (2026-05-08): UserList 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { UserList } from './UserList';
import {
  resetUsers,
  setUsersList,
  setUsersLoading,
  setUsersError,
  type AdminUser,
} from '../../admin/state/users-store';

beforeEach(() => {
  resetUsers();
  /* mock — admin-users-tab.js 의 helper 함수 노출 */
  window.__renderUserCardHtml = vi.fn((u: unknown, status: string) => {
    const user = u as AdminUser;
    return `<div data-user-id="${user.id}" class="card-mock">${user.real_name || user.name} [${status}]</div>`;
  });
});

afterEach(() => {
  cleanup();
  delete window.__renderUserCardHtml;
});

const makeUser = (id: number, name = `user${id}`): AdminUser => ({
  id,
  real_name: name,
  name,
  approval_status: 'pending',
  is_admin: 0,
});

describe('UserList', () => {
  it('초기 — 빈 list "사용자가 없습니다"', () => {
    const { container } = render(<UserList />);
    expect(container.textContent).toContain('해당 상태의 사용자가 없습니다');
  });

  it('loading=true → 불러오는 중 표시', () => {
    setUsersLoading('pending');
    const { container } = render(<UserList />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('error → 오류 메시지', () => {
    setUsersError('서버 다운');
    const { container } = render(<UserList />);
    expect(container.textContent).toContain('오류: 서버 다운');
  });

  it('users 1명 → 카드 1개', () => {
    setUsersList('pending', [makeUser(1, '박승호')]);
    const { container } = render(<UserList />);
    const cards = container.querySelectorAll('.card-mock');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('박승호');
  });

  it('users 3명 → 카드 3개 + 순서 보존', () => {
    setUsersList('approved_client', [
      makeUser(1, 'A'),
      makeUser(2, 'B'),
      makeUser(3, 'C'),
    ]);
    const { container } = render(<UserList />);
    const cards = container.querySelectorAll('.card-mock');
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain('A');
    expect(cards[2].textContent).toContain('C');
  });

  it('store update → 자동 re-render', () => {
    setUsersList('pending', [makeUser(1, '첫번째')]);
    const { container } = render(<UserList />);
    expect(container.textContent).toContain('첫번째');
    act(() => {
      setUsersList('admin', [makeUser(99, '관리자')]);
    });
    expect(container.textContent).toContain('관리자');
    expect(container.textContent).not.toContain('첫번째');
  });

  it('renderFn 호출 시 status prop 전달', () => {
    setUsersList('admin', [makeUser(1, 'admin user')]);
    render(<UserList />);
    expect(window.__renderUserCardHtml).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      'admin'
    );
  });

  it('__renderUserCardHtml 미로드 → fallback 메시지', () => {
    delete window.__renderUserCardHtml;
    setUsersList('pending', [makeUser(1)]);
    const { container } = render(<UserList />);
    expect(container.textContent).toContain('카드 렌더 함수 미로드');
  });

  it('renderFn 에러 시 fallback (개별 카드 단위)', () => {
    setUsersList('pending', [makeUser(1), makeUser(2), makeUser(3)]);
    /* user 2번 만 throw */
    window.__renderUserCardHtml = vi.fn((u: unknown) => {
      const user = u as AdminUser;
      if (user.id === 2) throw new Error('카드2 에러');
      return `<div class="card-mock" data-user-id="${user.id}">user${user.id}</div>`;
    });
    const { container } = render(<UserList />);
    expect(container.textContent).toContain('user1');
    expect(container.textContent).toContain('카드 렌더 실패');
    expect(container.textContent).toContain('user3');
  });
});
