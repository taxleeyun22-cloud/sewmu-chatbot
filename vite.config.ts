import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';

/**
 * Phase 0 — 토대 구축 빌드 설정
 *
 * 핵심 결정:
 * - HTML 6개(index/admin/staff/articles/office/business)는 Vite 가 처리하지 않고 raw 복사
 *   ↳ admin.html / staff.html 의 `<script src="/admin.js?v=NN">` 쿼리스트링 보존이
 *     최우선이라 Vite 의 HTML 자산 변환 경로를 통째로 우회
 * - Vite entry = src/main.ts 빈 placeholder 1개
 *   ↳ Phase 1 에서 Tailwind 토큰을 통해 사용, Phase 2 에서 office.html 분해 시 다중 entry 로 확장
 * - functions/ 는 Cloudflare Pages 가 repo root 에서 자동 인식 → dist 복사 불필요
 *
 * 절대 규칙:
 * - _headers 내용은 byte-identical 로 dist/ 에 복사 (보안 헤더 보존)
 * - sw.js 캐시 키(`sewmu-v57`) 보존
 * - articles/ 29편 통째 복사
 */
export default defineConfig({
  root: '.',
  publicDir: false,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/main.ts'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        // HTML 6개 — byte-identical 복사 (Phase 2 에서 점진 분해)
        { src: 'index.html', dest: '.' },
        { src: 'admin.html', dest: '.' },
        { src: 'staff.html', dest: '.' },
        { src: 'articles.html', dest: '.' },
        { src: 'office.html', dest: '.' },
        { src: 'business.html', dest: '.' },
        // Cloudflare Pages 헤더 규칙
        { src: '_headers', dest: '.' },
        // PWA 자산
        { src: 'manifest.json', dest: '.' },
        { src: 'sw.js', dest: '.' },
        { src: 'icon-*.png', dest: '.' },
        // 로고
        { src: 'logo.png', dest: '.' },
        { src: 'logo-icon.png', dest: '.' },
        { src: 'logo-vertical.png', dest: '.' },
        { src: 'logo-vertical.jpg', dest: '.' },
        // 외부참조 그대로 유지
        // admin-*.js glob — 쪼개기 진행 시 (admin-memos.js, admin-customer-dash.js 등) 자동 포함
        { src: 'admin.js', dest: '.' },
        { src: 'admin-*.js', dest: '.' },
        { src: 'admin.css', dest: '.' },
        // 검증 데이터 (자동 생성, GitHub 동기화)
        { src: 'flagged-items.json', dest: '.' },
        { src: 'flagged-faqs.json', dest: '.' },
        // 칼럼 29편
        { src: 'articles/**/*', dest: 'articles' },
      ],
    }),
  ],
});
