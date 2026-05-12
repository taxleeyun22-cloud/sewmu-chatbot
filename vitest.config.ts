import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Phase 0 → Phase #2 (2026-05-07): React 컴포넌트 테스트 지원 추가.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      /* apps/admin 의 Next.js path alias `@/*` → tsconfig.json 의 `apps/admin/*`.
       * 길이 순으로 먼저 매칭되도록 명시 (vite alias array 는 순서대로 시도). */
      { find: /^@\/lib\//, replacement: resolve(__dirname, 'apps/admin/lib/') + '/' },
      { find: /^@\/components\//, replacement: resolve(__dirname, 'apps/admin/components/') + '/' },
      { find: /^@\/app\//, replacement: resolve(__dirname, 'apps/admin/app/') + '/' },
      /* monorepo packages — workspaces not installed at root, alias for tests */
      { find: '@sewmu/db/test-db', replacement: resolve(__dirname, 'packages/db/src/test-db.ts') },
      { find: '@sewmu/db/client', replacement: resolve(__dirname, 'packages/db/src/client.ts') },
      { find: '@sewmu/db', replacement: resolve(__dirname, 'packages/db/schema/index.ts') },
      { find: '@sewmu/types', replacement: resolve(__dirname, 'packages/types/src/index.ts') },
      { find: '@sewmu/ai', replacement: resolve(__dirname, 'packages/ai/src/index.ts') },
      { find: '@sewmu/auth', replacement: resolve(__dirname, 'packages/auth/src/index.ts') },
      { find: '@sewmu/api', replacement: resolve(__dirname, 'packages/api/src/index.ts') },
      /* src/* catch-all — 위 specific 매칭 안 된 `@/*` 는 모두 src/ 로 (기존 동작) */
      { find: /^@\//, replacement: resolve(__dirname, 'src/') + '/' },
    ],
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
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'functions/**/*.test.ts',
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
