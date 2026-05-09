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
        // 사장님 admin 디자인 토큰 (admin.css 호환)
        'sb-bg': '#f5f6f8',
        'sb-text': '#4e5968',
        'sb-text-mute': '#8b95a1',
        'sb-active-bg': '#e8f3ff',
        'sb-active-text': '#3182f6',
        'brand-primary': '#3182f6',
        'brand-danger': '#dc2626',
        'brand-warn': '#fbbf24',
        'brand-success': '#10b981',
      },
      fontFamily: {
        sans: ['Noto Sans KR', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
