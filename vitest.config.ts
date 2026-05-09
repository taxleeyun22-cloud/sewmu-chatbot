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
      /* monorepo packages — workspaces not installed at root, alias for tests */
      '@sewmu/db/test-db': resolve(__dirname, 'packages/db/src/test-db.ts'),
      '@sewmu/db/client': resolve(__dirname, 'packages/db/src/client.ts'),
      '@sewmu/db': resolve(__dirname, 'packages/db/schema/index.ts'),
      '@sewmu/types': resolve(__dirname, 'packages/types/src/index.ts'),
      '@sewmu/ai': resolve(__dirname, 'packages/ai/src/index.ts'),
      '@sewmu/auth': resolve(__dirname, 'packages/auth/src/index.ts'),
      '@sewmu/api': resolve(__dirname, 'packages/api/src/index.ts'),
    },
  },
  test: {
    /* happy-dom for React; node integration tests use environmentMatchGlobs */
    environment: 'happy-dom',
    environmentMatchGlobs: [
      ['packages/api/src/routers/__tests__/**', 'node'],
    ],
    include: [
      'src/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ],
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    /* node:sqlite is a Node 22+ builtin — Vite needs to know not to bundle it. */
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
});
