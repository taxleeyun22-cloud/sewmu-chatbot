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

import { useEffect, useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark';

/**
 * Phase 15 audit fix (2026-05-12): useSyncExternalStore 로 SSR/CSR 일관.
 *
 * 이전 사고: useState('light') default → useEffect 에서 dark 적용 → 첫 paint 에
 * 라이트 모드 button 라벨 표시 → 깜빡임 (FOUC). aria-pressed 도 잠시 false.
 *
 * 해결: useSyncExternalStore — SSR snapshot 은 'light' (no localStorage 접근),
 * 클라이언트 hydration 부터는 즉시 html.dark 클래스 읽기 — layout.tsx 의
 * inline FOUC 스크립트 가 paint 전에 이미 클래스 추가했으므로 첫 render 부터 정확.
 */
function getClientSnapshot(): Theme {
  if (typeof document === 'undefined') return 'light';
  /* FOUC inline script 가 paint 전 html.dark 추가했으므로 그것을 신뢰 — single source of truth. */
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function getServerSnapshot(): Theme {
  return 'light';
}

/* External store — `theme` change 시 subscribe callback 호출. */
const themeChangeListeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  themeChangeListeners.add(callback);
  return () => themeChangeListeners.delete(callback);
}

function notifyThemeChange(): void {
  for (const cb of themeChangeListeners) cb();
}

function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  notifyThemeChange();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  /* layout.tsx 의 inline FOUC script 가 paint 전 dark 적용한다.
   * 단, FOUC script 가 없는 환경 (테스트 / 일부 SSG path) 에서도 mount 시 한 번 sync.
   * localStorage 가 dark 인데 class 가 없으면 추가. */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      const saved = localStorage.getItem('theme');
      const hasClass = document.documentElement.classList.contains('dark');
      if (saved === 'dark' && !hasClass) {
        applyTheme('dark');
      } else if (saved === 'light' && hasClass) {
        applyTheme('light');
      } else if (!saved) {
        /* system preference fallback */
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark !== hasClass) {
          applyTheme(prefersDark ? 'dark' : 'light');
        }
      }
    } catch {
      /* silent */
    }
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
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
