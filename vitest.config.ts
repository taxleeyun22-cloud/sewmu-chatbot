import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Phase 0 → Phase #2 (2026-05-07): React 컴포넌트 테스트 지원 추가.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,  /* @testing-library/jest-dom matchers 자동 적용 위해 */
    setupFiles: ['./src/test-setup.ts'],
  },
});
