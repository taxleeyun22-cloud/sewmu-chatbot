/**
 * Phase #2: AdminRoleBadge 단위 테스트 (React Testing Library).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { AdminRoleBadge } from './AdminRoleBadge';

beforeEach(() => {
  // @ts-expect-error — admin-globals.d.ts declares
  window.KEY = 'TEST_KEY';
  global.fetch = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminRoleBadge', () => {
  it('owner role → 👑 표시', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: 'owner', owner: true, manager: true, userId: 1 }),
    });
    render(<AdminRoleBadge pollMs={0} />);
    await waitFor(() => expect(screen.queryByText(/권한 확인 중/)).not.toBeInTheDocument());
    expect(screen.getByText('👑')).toBeInTheDocument();
    expect(screen.getByText('사장님')).toBeInTheDocument();
  });

  it('manager role → 🛡️ Manager', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: 'manager', owner: false, manager: true, userId: 5 }),
    });
    render(<AdminRoleBadge pollMs={0} />);
    await waitFor(() => expect(screen.queryByText(/권한 확인 중/)).not.toBeInTheDocument());
    expect(screen.getByText('🛡️')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
  });

  it('staff role → 회색 배지', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: 'staff', owner: false, manager: false, userId: 8 }),
    });
    render(<AdminRoleBadge pollMs={0} />);
    await waitFor(() => expect(screen.queryByText(/권한 확인 중/)).not.toBeInTheDocument());
    expect(screen.getByText('Staff')).toBeInTheDocument();
  });

  it('미인증 (KEY 없음) → 표시 X', async () => {
    // @ts-expect-error
    delete window.KEY;
    render(<AdminRoleBadge pollMs={0} />);
    await waitFor(() => expect(screen.queryByText(/권한 확인 중/)).not.toBeInTheDocument());
    expect(screen.queryByText(/Manager|Staff|사장님/)).not.toBeInTheDocument();
  });

  it('block variant — 큰 배지', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: 'owner', owner: true, manager: true, userId: 1 }),
    });
    render(<AdminRoleBadge pollMs={0} variant="block" />);
    await waitFor(() => expect(screen.queryByText(/권한 확인 중/)).not.toBeInTheDocument());
    const badge = screen.getByText('사장님').parentElement;
    expect(badge).toHaveStyle({ padding: '6px 12px' });
  });

  it('초기 loading state', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolve
    );
    render(<AdminRoleBadge pollMs={0} />);
    expect(screen.getByText(/권한 확인 중/)).toBeInTheDocument();
  });

  it('네트워크 에러 → 표시 X', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    render(<AdminRoleBadge pollMs={0} />);
    await waitFor(() => expect(screen.queryByText(/권한 확인 중/)).not.toBeInTheDocument());
    expect(screen.queryByText(/Manager|Staff|사장님/)).not.toBeInTheDocument();
  });
});
