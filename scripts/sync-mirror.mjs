#!/usr/bin/env node
/**
 * sync-mirror.mjs — root 정적 자산을 apps/admin/public 으로 미러 동기화
 *
 * 배경 (A-3, 2026-05-17 사장님 명령 "미러자동화"):
 *   옛 인프라(sewmu-chatbot)는 repo-root 의 *.js / *.html / *.css 를 그대로 서빙.
 *   새 admin(sewmu-admin, apps/admin)은 같은 파일을 apps/admin/public 에서 서빙.
 *   = 매 commit 마다 수동 `cp` 필요 → 잊으면 silent drift (실제 admin.css 가 드리프트 났었음).
 *
 * 해결: 이 스크립트가 단일 정본(root) → 미러(apps/admin/public) 를 자동 복사.
 *   - pre-commit hook 에서 실행 + 변경분을 자동 git add → drift 영구 차단
 *   - apps/admin prebuild 에서도 실행 → CI 빌드도 항상 최신 (belt-and-suspenders)
 *
 * 정본 = repo root. apps/admin/public 은 항상 root 를 따라감 (역방향 금지).
 * 환경별 분기가 필요하면 root 에 통합 (예: admin.css P0 모달 fix 를 root 로 포팅함).
 *
 * 제외: filing-tax-credit-catalog.json / permissions.json 등은 root `public/` 에서
 *       vite viteStaticCopy 로 별도 관리 → 이 미러 대상 아님.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MIRROR = join(ROOT, 'apps', 'admin', 'public');

/* 정본 목록 — admin/거래처 웹에서 서빙되는 root 정적 자산 (명시적·결정적).
 * 새 파일 추가 시 여기 1줄 추가 → 자동 미러. */
const FILES = [
  // admin 모듈 (classic script)
  'admin.js',
  'admin-anal-review-faq.js',
  'admin-business-tab.js',
  'admin-customer-dash.js',
  'admin-docs.js',
  'admin-filing-review.js',
  'admin-memos.js',
  'admin-rooms-list.js',
  'admin-rooms-misc.js',
  'admin-rooms-msg.js',
  'admin-search-bulk.js',
  'admin-users-tab.js',
  // 거래처/공통
  'business.js',
  'index.js',
  'office.js',
  'paste-drop.js',
  'sw.js',
  // HTML
  'admin.html',
  'admin-modals.html',
  'articles.html',
  'business.html',
  'index.html',
  'index-modals.html',
  'memo-window.html',
  'office.html',
  'staff.html',
  // CSS
  'admin.css',
  'business.css',
  'index.css',
  'office.css',
];

if (!existsSync(MIRROR)) mkdirSync(MIRROR, { recursive: true });

let copied = 0;
const missingRoot = [];
const synced = [];

for (const f of FILES) {
  const src = join(ROOT, f);
  const dst = join(MIRROR, f);
  if (!existsSync(src)) { missingRoot.push(f); continue; }
  const srcBuf = readFileSync(src);
  let same = false;
  if (existsSync(dst)) {
    try { same = readFileSync(dst).equals(srcBuf); } catch { same = false; }
  }
  if (!same) {
    writeFileSync(dst, srcBuf);
    copied++;
    synced.push(f);
  }
}

if (missingRoot.length) {
  console.error('⚠️  sync-mirror: root 에 없는 정본 파일 (목록 점검 필요): ' + missingRoot.join(', '));
}
if (copied === 0) {
  console.log('✅ sync-mirror: 미러 이미 최신 (드리프트 0)');
} else {
  console.log('✅ sync-mirror: ' + copied + '개 동기화 → apps/admin/public/');
  console.log('   ' + synced.join(', '));
}

/* CI 검증용: --check 모드 시 드리프트 있으면 비정상 종료 (복사 안 함) */
if (process.argv.includes('--check') && copied > 0) {
  console.error('❌ sync-mirror --check: 미러 드리프트 감지 (' + synced.join(', ') + ')');
  process.exit(1);
}
