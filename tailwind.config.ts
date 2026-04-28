import type { Config } from 'tailwindcss';

/**
 * Phase 1 — 디자인 토큰 매핑
 *
 * src/styles/globals.css 의 CSS 변수를 Tailwind 유틸 클래스로 노출.
 * Phase 2 부터 office 모듈에서 `bg-of-primary`, `text-sb-text` 같은
 * 클래스를 그대로 쓰면 var(--of-primary) 가 적용됨.
 *
 * content 경로:
 * - office.html: 현재 inline 스타일 + 토큰 사용. Phase 2 분해 후 src/ 모듈로 이전.
 * - src/**: Phase 2+ 에서 채워짐.
 * - 다른 HTML(index/admin/staff/articles/business) 의 inline 스타일은 건드리지 않음.
 */
export default {
  content: [
    './office.html',
    './src/**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        // 메인 영역 톤
        'of-bg': 'var(--of-bg)',
        'of-card': 'var(--of-card)',
        'of-border': 'var(--of-border)',
        // 텍스트
        'of-text-main': 'var(--of-text-main)',
        'of-text-sub': 'var(--of-text-sub)',
        'of-text-mute': 'var(--of-text-mute)',
        // 브랜드
        'of-primary': 'var(--of-primary)',
        'of-primary-soft': 'var(--of-primary-soft)',
        'of-primary-dark': 'var(--of-primary-dark)',
        // 사이드바
        'sb-bg': 'var(--sb-bg)',
        'sb-bg-deep': 'var(--sb-bg-deep)',
        'sb-text': 'var(--sb-text)',
        'sb-text-mute': 'var(--sb-text-mute)',
        'sb-hover': 'var(--sb-hover)',
        'sb-active-bg': 'var(--sb-active-bg)',
        'sb-active-text': 'var(--sb-active-text)',
        'sb-section': 'var(--sb-section)',
        'sb-divider': 'var(--sb-divider)',
        'sb-cnt-bg': 'var(--sb-cnt-bg)',
        'sb-cnt-text': 'var(--sb-cnt-text)',
        // 상태·D-day
        'of-overdue': 'var(--of-overdue)',
        'of-today': 'var(--of-today)',
        'of-tomorrow': 'var(--of-tomorrow)',
        'of-week': 'var(--of-week)',
        'of-later': 'var(--of-later)',
        'of-success': 'var(--of-success)',
        'of-success-soft': 'var(--of-success-soft)',
        'of-warn': 'var(--of-warn)',
        'of-warn-soft': 'var(--of-warn-soft)',
        'of-danger': 'var(--of-danger)',
        'of-danger-soft': 'var(--of-danger-soft)',
      },
      borderRadius: {
        'of-sm': 'var(--of-r-sm)',
        'of-md': 'var(--of-r-md)',
        'of-lg': 'var(--of-r-lg)',
      },
      boxShadow: {
        'of-sm': 'var(--of-shadow-sm)',
        'of-md': 'var(--of-shadow-md)',
        'of-lg': 'var(--of-shadow-lg)',
      },
      fontFamily: {
        sans: ['"Noto Sans KR"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
