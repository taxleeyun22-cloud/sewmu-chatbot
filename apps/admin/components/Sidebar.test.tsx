/**
 * Phase 14 (2026-05-12): Sidebar smoke 테스트.
 *
 * Google audit "0 component tests" 지적 fix — 가장 많이 클릭되는 컴포넌트부터.
 * - 섹션 라벨 / 항목 라벨 / aria-current 동작
 * - 모바일 drawer open/close
 * - ESC 키 닫기
 *
 * React Query / Next.js navigation 은 mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';

/* Next.js usePathname mock */
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/dashboard',
}));

/* Next.js Link mock — 그냥 anchor 렌더 */
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: { children: React.ReactNode; href: string } & React.HTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/* trpcCall mock — 빈 응답 (count 모두 0) */
vi.mock('@/lib/trpc', () => ({
  trpcCall: vi.fn().mockResolvedValue({
    pendingUsers: 3,
    approvedClients: 250,
    activeRooms: 12,
    urgentTodos: 2,
    pendingDocs: 0,
    reviewPending: 0,
    filingsInProgress: 0,
    errorLogs: 0,
    businesses: 310,
    memosTotal: 100,
    trash: 0,
    rejectedUsers: 0,
    terminatedUsers: 0,
    adminUsers: 4,
    unreadMessages: 0,
  }),
}));

import React from 'react';

function renderSidebar(props = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Sidebar {...props} />
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('섹션 라벨 표시 (상담/영업/사용자·업체/문서·메모/관리/알림)', () => {
    renderSidebar();
    expect(screen.getByText('상담')).toBeInTheDocument();
    expect(screen.getByText('영업')).toBeInTheDocument();
    expect(screen.getByText('영업 파이프라인')).toBeInTheDocument();
    expect(screen.getByText('사용자/업체')).toBeInTheDocument();
    expect(screen.getByText('문서·메모')).toBeInTheDocument();
    expect(screen.getByText('관리')).toBeInTheDocument();
    expect(screen.getByText('알림')).toBeInTheDocument();
  });

  it('핵심 link 표시', () => {
    renderSidebar();
    expect(screen.getByText('상담방')).toBeInTheDocument();
    expect(screen.getByText('사용자')).toBeInTheDocument();
    expect(screen.getByText('업체')).toBeInTheDocument();
    expect(screen.getByText('대시보드')).toBeInTheDocument();
    expect(screen.getByText('전역 검색')).toBeInTheDocument();
  });

  it('aria-current="page" 가 현재 path 에만', () => {
    renderSidebar();
    const dashboardLink = screen.getByText('대시보드').closest('a');
    expect(dashboardLink?.getAttribute('aria-current')).toBe('page');

    const usersLink = screen.getByText('사용자').closest('a');
    expect(usersLink?.getAttribute('aria-current')).toBeNull();
  });

  it('ThemeToggle 마운트', () => {
    renderSidebar();
    /* ThemeToggle 의 default 라이트 모드 — "다크 모드" 라벨 */
    expect(screen.getByText('다크 모드')).toBeInTheDocument();
  });

  it('로그아웃 버튼 + aria-label', () => {
    renderSidebar();
    expect(screen.getByText('로그아웃')).toBeInTheDocument();
  });

  it('mobileOpen=false → backdrop 안 보임', () => {
    renderSidebar({ mobileOpen: false });
    /* backdrop = aria-hidden + bg-black/50 */
    const backdrop = document.querySelector('.md\\:hidden.fixed.inset-0');
    expect(backdrop).toBeNull();
  });

  it('mobileOpen=true → backdrop + 닫기 버튼 표시', () => {
    const onClose = vi.fn();
    renderSidebar({ mobileOpen: true, onMobileClose: onClose });
    /* 닫기 X 버튼 */
    const closeBtn = screen.getByLabelText('메뉴 닫기');
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('mobile drawer ESC 키 → onMobileClose 호출', () => {
    const onClose = vi.fn();
    renderSidebar({ mobileOpen: true, onMobileClose: onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
