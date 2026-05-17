import { defineConfig, type Plugin } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase Infra-1 (2026-05-09): 자동 cache busting plugin.
 *
 * 매 build 시점:
 *   1. git commit short hash 가져옴 (예: "fda8bd2")
 *   2. dist/ 안 모든 HTML 파일 의 `?v=숫자` 를 `?v=<hash>` 로 자동 교체
 *   3. assets/ 안 .js / .css 도 query 없는 link 에 `?v=<hash>` 추가
 *
 * 사장님 효과:
 *   - 매 commit 시 자동 cache bust (사용자 새로 받음)
 *   - 같은 commit 재배포 시 cache 유지 (효율)
 *   - 매번 수동 admin.js?v=185 → ?v=186 폐기
 */
function autoCacheBustPlugin(): Plugin {
  let buildVersion = '';
  return {
    name: 'auto-cache-bust',
    apply: 'build',
    buildStart() {
      try {
        buildVersion = execSync('git rev-parse --short HEAD').toString().trim();
      } catch {
        // git 없을 때 fallback — timestamp
        buildVersion = String(Date.now()).slice(-7);
      }
      console.log(`[auto-cache-bust] version = ${buildVersion}`);
    },
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      let totalReplaced = 0;
      let filesProcessed = 0;
      function walk(dir: string) {
        for (const entry of readdirSync(dir)) {
          const p = join(dir, entry);
          const st = statSync(p);
          if (st.isDirectory()) {
            walk(p);
          } else if (entry.endsWith('.html')) {
            let html = readFileSync(p, 'utf-8');
            const before = html;
            // 1) `?v=숫자` → `?v=<hash>`
            html = html.replace(/\?v=[\w]+/g, `?v=${buildVersion}`);
            // 2) `/assets/xxx.js` (query 없으면) → `/assets/xxx.js?v=<hash>` (vite hash output 대비)
            //   단, 이미 `?v=` 있으면 위 룰에서 처리됨.
            // 3) `/admin.js` 같은 root .js (query 없으면) → 동일
            // 일단 1) 만 적용. 매 HTML 의 `?v=` 다 교체.
            if (html !== before) {
              writeFileSync(p, html);
              totalReplaced += (before.match(/\?v=[\w]+/g) || []).length;
              filesProcessed++;
            }
          }
        }
      }
      try {
        walk(distDir);
        console.log(`[auto-cache-bust] ${filesProcessed} HTML 파일 처리, ?v=${buildVersion} 자동 적용 (${totalReplaced}곳)`);
      } catch (e) {
        console.warn('[auto-cache-bust] dist/ 처리 실패:', (e as Error).message);
      }
    },
  };
}

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
        /* Phase #2 (2026-05-07): React entry — admin.html 안 mount points 자동 처리.
         * 별도 output assets/react.js + assets/react.css. 사장님 화면 영향 0 (HTML 변경 X). */
        react: resolve(__dirname, 'src/react/main.tsx'),
      },
      output: {
        // Phase S3a (2026-05-04): main.js 파일명 고정 (hash 제거) → HTML 에서 ?v=N 으로 cache bust
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        // Phase T1 (2026-05-04): Tailwind output (main.css) 파일명 고정 → HTML 에서 ?v=N 으로 cache bust
        assetFileNames: 'assets/[name][extname]',
        /**
         * Phase 13 (2026-05-12): manualChunks 분리 — react.js 594KB → 작은 청크 N개.
         *
         * 효과 (사장님 admin 첫 진입):
         *   - 매 commit 시 app 코드만 cache bust → vendor chunk 는 재캐싱 (LCP ↓)
         *   - recharts (~250KB) 는 분석 페이지만 fetch 가능 (HTTP/2 parallel)
         *   - sentry 는 DSN 없으면 init 도 skip → vendor-sentry 받아도 idle
         *
         * 묶음 기준:
         *   - vendor-react: react / react-dom / scheduler (가장 stable, 캐싱 효과 최대)
         *   - vendor-recharts: recharts (CustomerFinanceChart 만 사용)
         *   - vendor-sentry: @sentry/react / @sentry/browser
         *   - vendor-nanostores: nanostores / @nanostores/react
         *   - 그 외 모듈 (lucide-react, drizzle 등) → 기본 react.js 청크
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/recharts/') || id.includes('node_modules/d3-')) {
            return 'vendor-recharts';
          }
          if (id.includes('node_modules/@sentry/')) {
            return 'vendor-sentry';
          }
          if (
            id.includes('node_modules/nanostores/') ||
            id.includes('node_modules/@nanostores/')
          ) {
            return 'vendor-nanostores';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    autoCacheBustPlugin(),
    viteStaticCopy({
      targets: [
        // HTML 6개 — byte-identical 복사 (Phase 2 에서 점진 분해)
        { src: 'index.html', dest: '.' },
        { src: 'admin.html', dest: '.' },
        { src: 'staff.html', dest: '.' },
        { src: 'articles.html', dest: '.' },
        { src: 'office.html', dest: '.' },
        { src: 'business.html', dest: '.' },
        { src: 'memo-window.html', dest: '.' },
        // Phase H2 (2026-05-04): admin/staff/office 모달 통합 묶음 (fetch + insertAdjacentHTML 패턴)
        { src: 'admin-modals.html', dest: '.' },
        // Phase H3 (2026-05-04): index.html 인라인 JS 3468줄 외부화
        { src: 'index.js', dest: '.' },
        // Phase H4 (2026-05-04): index.html <style> 4개 블록 → index.css 외부화
        { src: 'index.css', dest: '.' },
        // Phase H5 (2026-05-04): index.html 모달 11개 → index-modals.html 묶음 (admin-modals 패턴)
        { src: 'index-modals.html', dest: '.' },
        // Phase H6a (2026-05-04): business.html 인라인 CSS/JS 외부화
        { src: 'business.css', dest: '.' },
        { src: 'business.js', dest: '.' },
        // Phase H6b (2026-05-04): office.html 인라인 CSS/JS 외부화
        { src: 'office.css', dest: '.' },
        { src: 'office.js', dest: '.' },
        // Cloudflare Pages 헤더 규칙
        { src: '_headers', dest: '.' },
        // Phase S3a (2026-05-04): Cloudflare Pages SPA fallback (모든 path → /index.html 200)
        { src: '_redirects', dest: '.' },
        // PWA 자산
        { src: 'manifest.json', dest: '.' },
        { src: 'admin-manifest.json', dest: '.' },  // R7 (2026-05-05): admin PWA
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
        // Phase B-1 (2026-05-17): paste-drop.js classic → src/lib/paste-drop.ts (main 번들). static copy 제거.
        // 검증 데이터 (자동 생성, GitHub 동기화)
        { src: 'flagged-items.json', dest: '.' },
        { src: 'flagged-faqs.json', dest: '.' },
        // Phase 16 (2026-05-13): 신고검토표 공제·감면 자동완성 카탈로그
        { src: 'public/filing-tax-credit-catalog.json', dest: '.' },
        // Phase Next-Day27: 권한 catalog SSOT (rbac.ts → permissions.json)
        { src: 'public/permissions.json', dest: '.' },
        // 칼럼 29편
        { src: 'articles/**/*', dest: 'articles' },
      ],
    }),
  ],
});
