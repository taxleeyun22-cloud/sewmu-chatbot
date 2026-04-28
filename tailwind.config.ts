import type { Config } from 'tailwindcss';

/**
 * Phase 0 — Tailwind 골격
 *
 * content 경로 의도:
 * - office.html 만 처리 (Phase 1 에서 토큰 도입 시 시작점)
 * - src/ 전체 (Phase 2 부터 모듈로 채움)
 * - index.html / admin.html / staff.html / articles.html 의 inline 스타일은 건드리지 않음
 *   (대형 inline `<style>` 블록과의 충돌 방지)
 */
export default {
  content: [
    './office.html',
    './src/**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      // Phase 1 에서 디자인 토큰(색·간격·폰트) 채움
    },
  },
  plugins: [],
} satisfies Config;
