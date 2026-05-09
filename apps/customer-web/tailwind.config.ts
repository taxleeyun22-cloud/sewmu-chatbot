/**
 * Phase Next-Week2 (2026-05-09): customer-web Tailwind config.
 *
 * 디자인 토큰 (사장님 룰 — admin.css 의 토큰 호환):
 *   - brand-primary #3182f6 (확인·저장)
 *   - brand-danger #dc2626 (삭제·취소)
 *   - brand-warn #fbbf24 (경고)
 *   - brand-success #10b981 (완료)
 *   - brand-kakao #FEE500 (카톡 톤 고정)
 */
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#3182f6',
        'brand-danger': '#dc2626',
        'brand-warn': '#fbbf24',
        'brand-success': '#10b981',
        'brand-kakao': '#FEE500',
        'brand-kakao-text': '#191919',
      },
      fontFamily: {
        sans: ['Noto Sans KR', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
