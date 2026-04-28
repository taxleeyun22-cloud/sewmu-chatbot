import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Phase 0 — Vitest 골격 (Phase 5 에서 실제 테스트 채움)
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
