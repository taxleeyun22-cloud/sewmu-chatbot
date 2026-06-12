import type { Config } from 'tailwindcss';

const config: Config = {
  /* Phase 14 (2026-05-12): Dark mode — `class` 전략 (localStorage persistent). */
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /**
         * Phase 14 dark mode: CSS variable 기반 — :root / .dark 가 swap.
         * 값은 globals.css 의 :root 정의. 폴백 hex 는 fail-safe.
         */
        'sb-bg': 'var(--sb-bg, #f5f6f8)',
        'sb-text': 'var(--sb-text, #4e5968)',
        'sb-text-mute': 'var(--sb-text-mute, #8b95a1)',
        'sb-active-bg': 'var(--sb-active-bg, #e8f3ff)',
        'sb-active-text': 'var(--sb-active-text, #3182f6)',
        'brand-primary': 'var(--brand-primary, #3182f6)',
        'brand-danger': 'var(--brand-danger, #dc2626)',
        'brand-warn': 'var(--brand-warn, #fbbf24)',
        'brand-success': 'var(--brand-success, #10b981)',
      },
      fontFamily: {
        /* 토스-3 (2026-06-12): Pretendard 우선 (토스 톤), Noto fallback */
        sans: ['Pretendard', 'Noto Sans KR', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
