/**
 * Phase 14 (2026-05-12): 다크/라이트 모드 토글.
 *
 * - localStorage 'theme' 키 'dark' | 'light' | null (system)
 * - 처음 mount 시: localStorage 값 또는 prefers-color-scheme 따라 적용
 * - 토글 시: html 에 'dark' 클래스 추가/제거 + localStorage save
 *
 * Sidebar 하단에 mount.
 */
'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark';

/**
 * SSR-safe — 서버 렌더 시 'light' default.
 * client 에서 hydration 후 즉시 localStorage / system 반영.
 *
 * 깜빡임 (FOUC) 방지를 위해 globals.css 또는 layout 에서 inline script 로
 * 첫 paint 전에 'dark' 클래스 적용하는 것도 가능 (Phase 15 후속).
 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    /* system preference fallback */
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode 등 — silent */
    }
  }

  const isDark = theme === 'dark';
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? '라이트 모드' : '다크 모드';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${label}로 전환`}
      aria-pressed={isDark}
      className={cn(
        'w-full text-left text-[11px] text-gray-600 dark:text-gray-300',
        'hover:text-brand-primary flex items-center gap-1.5 py-1 rounded px-1 transition-colors',
        'hover:bg-blue-50 dark:hover:bg-gray-800',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary',
      )}
      title={label}
    >
      <Icon size={12} strokeWidth={1.8} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
