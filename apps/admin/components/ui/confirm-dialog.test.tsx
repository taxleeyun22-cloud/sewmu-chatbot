/**
 * Phase 11 cleanup (2026-05-12): ConfirmDialog 단위 테스트.
 *
 * a11y + 키보드 + promise resolution 검증.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { confirm, ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('confirm() → role="alertdialog" + 제목/설명 표시', async () => {
    render(<ConfirmDialog />);
    const p = confirm({
      title: '삭제',
      description: '정말 삭제하시겠습니까?',
    });
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
    expect(screen.getByText('삭제')).toBeInTheDocument();
    expect(screen.getByText('정말 삭제하시겠습니까?')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-cancel'));
    expect(await p).toBe(false);
  });

  it('확인 버튼 클릭 → Promise resolve(true)', async () => {
    render(<ConfirmDialog />);
    const p = confirm({ title: '확인' });
    await waitFor(() => screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByTestId('confirm-ok'));
    expect(await p).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('취소 버튼 클릭 → Promise resolve(false)', async () => {
    render(<ConfirmDialog />);
    const p = confirm({ title: '확인' });
    await waitFor(() => screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    expect(await p).toBe(false);
  });

  it('ESC → 취소', async () => {
    render(<ConfirmDialog />);
    const p = confirm({ title: '확인' });
    await waitFor(() => screen.getByRole('alertdialog'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await p).toBe(false);
  });

  it('Enter → 확인', async () => {
    render(<ConfirmDialog />);
    const p = confirm({ title: '확인' });
    await waitFor(() => screen.getByRole('alertdialog'));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(await p).toBe(true);
  });

  it('Backdrop 클릭 → 취소', async () => {
    render(<ConfirmDialog />);
    const p = confirm({ title: '확인' });
    await waitFor(() => screen.getByRole('alertdialog'));
    /* backdrop = aria-hidden div */
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(await p).toBe(false);
  });

  it('destructive variant → confirm 버튼 빨간색 클래스', async () => {
    render(<ConfirmDialog />);
    const p = confirm({
      title: '삭제',
      variant: 'destructive',
      confirmText: '삭제',
    });
    await waitFor(() => screen.getByRole('alertdialog'));
    const ok = screen.getByTestId('confirm-ok');
    expect(ok.className).toMatch(/brand-danger|red/i);
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    await p;
  });

  it('연속 호출 → 이전 다이얼로그 false 로 resolve + 새 것 표시', async () => {
    render(<ConfirmDialog />);
    const p1 = confirm({ title: '첫번째' });
    await waitFor(() => screen.getByText('첫번째'));
    const p2 = confirm({ title: '두번째' });
    /* 첫번째는 false 로 resolve */
    expect(await p1).toBe(false);
    /* 두번째 다이얼로그 표시 */
    await waitFor(() => screen.getByText('두번째'));
    fireEvent.click(screen.getByTestId('confirm-ok'));
    expect(await p2).toBe(true);
  });

  it('자동 포커스 — 취소 버튼 (안전 default)', async () => {
    render(<ConfirmDialog />);
    const p = confirm({ title: '삭제', variant: 'destructive' });
    await waitFor(() => screen.getByRole('alertdialog'));
    /* 포커스가 cancel 버튼에 가 있어야 함 — Enter 가 confirm 실수 방지 */
    expect(document.activeElement).toBe(screen.getByTestId('confirm-cancel'));
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    await p;
  });
});
