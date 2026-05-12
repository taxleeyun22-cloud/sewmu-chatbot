/**
 * Phase 14 (2026-05-12): ThemeToggle 단위 테스트.
 *
 * localStorage persistence + html.dark 클래스 토글 + ARIA pressed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('초기 mount — 라이트 (default)', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('다크 모드')).toBeInTheDocument();
  });

  it('localStorage theme="dark" 이면 다크 default', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('클릭 → 토글 + localStorage save', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    /* 라이트 → 다크 */
    act(() => {
      fireEvent.click(btn);
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    /* 다크 → 라이트 */
    act(() => {
      fireEvent.click(btn);
    });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('aria-label 정확 (스크린리더)', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toContain('전환');
  });
});
