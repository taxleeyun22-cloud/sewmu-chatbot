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
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
  'admin-pc-notify.js',
  'admin-owner-export.js',
  'admin-custdash-grid.js',
  // 거래처/공통
  'business.js',
  'index.js',
  'office.js',
  // 'paste-drop.js' — B-1 (2026-05-17): src/lib/paste-drop.ts (main 번들) 로 전환, classic 파일 폐기
  'sw.js',
  // HTML
  'admin.html',
  'admin-modals.html',
  'articles.html',
  'business.html',
  'index.html',
  'index-modals.html',
  'memo-window.html',
  'cust-dash-preview.html',
  'biz-dash-preview.html',
  'home-preview.html',
  'memo-all.html',
  'review-all.html',
  'billing-preview.html',
  'billing-preview.css',
  'billing-preview.js',
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

/* ---- functions/api 미러 (P0 #1, 2026-07-02) ----
 * 배경: admin*.js/html 은 자동 미러인데 백엔드(functions/api)는 수동 cp 였음
 * → 2026-06-30 새 admin 401 사고(_adminAuth.js 드리프트)의 원인. 자동화로 근본 차단.
 * 정본 = root functions/api → 미러 = apps/admin/functions/api (역방향 금지).
 * *.js / *.json 만 (테스트 *.test.ts / *.integration.test.ts 는 root 전용).
 * 미러 쪽 여분 파일은 삭제하지 않음 (안전). */
const FN_SRC = join(ROOT, 'functions', 'api');
const FN_DST = join(ROOT, 'apps', 'admin', 'functions', 'api');
const fnSynced = [];
function syncFnDir(rel) {
  const absDir = join(FN_SRC, rel);
  for (const name of readdirSync(absDir)) {
    const r = rel ? rel + '/' + name : name;
    const src = join(FN_SRC, r);
    if (statSync(src).isDirectory()) { syncFnDir(r); continue; }
    if (!/\.(js|json)$/.test(name)) continue;
    const dst = join(FN_DST, r);
    const buf = readFileSync(src);
    let same = false;
    if (existsSync(dst)) { try { same = readFileSync(dst).equals(buf); } catch { same = false; } }
    if (!same) {
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, buf);
      fnSynced.push(r);
    }
  }
}
if (existsSync(FN_SRC)) syncFnDir('');

const totalDrift = copied + fnSynced.length;
if (missingRoot.length) {
  console.error('⚠️  sync-mirror: root 에 없는 정본 파일 (목록 점검 필요): ' + missingRoot.join(', '));
}
if (totalDrift === 0) {
  console.log('✅ sync-mirror: 미러 이미 최신 (드리프트 0)');
} else {
  if (copied) console.log('✅ sync-mirror: ' + copied + '개 동기화 → apps/admin/public/\n   ' + synced.join(', '));
  if (fnSynced.length) console.log('✅ sync-mirror: ' + fnSynced.length + '개 동기화 → apps/admin/functions/api/\n   ' + fnSynced.join(', '));
}

/* CI 검증용: --check 모드 시 드리프트 있으면 비정상 종료 (복사는 이미 수행됨 — 커밋 전 상태 검증용) */
if (process.argv.includes('--check') && totalDrift > 0) {
  console.error('❌ sync-mirror --check: 미러 드리프트 감지 (' + synced.concat(fnSynced.map(f=>'functions/api/'+f)).join(', ') + ')');
  process.exit(1);
}

/* --stage 모드: pre-commit hook 용. FILES 단일 소스 기준으로만 명시 git add.
 * (옛: hook 에 30경로 하드코딩 → sync-mirror FILES 와 dual-maintenance drift.
 *  B-1 에서 paste-drop 제거 시 한쪽 빠뜨려 commit 깨졌던 약점 — DRY 로 근본 제거.)
 * git add -A 금지 룰 준수: FILES 에서 파생된 명시 경로만 stage. */
if (process.argv.includes('--stage')) {
  const paths = FILES
    .map((f) => join(MIRROR, f))
    .concat(fnSynced.map((f) => join(FN_DST, f)))
    .filter((p) => existsSync(p))
    .map((p) => p.replace(ROOT + (process.platform === 'win32' ? '\\' : '/'), '').replace(/\\/g, '/'));
  if (paths.length) {
    try {
      execFileSync('git', ['add', ...paths], { cwd: ROOT, stdio: 'ignore' });
    } catch (e) {
      console.error('⚠️  sync-mirror --stage: git add 실패 (commit 은 계속) — ' + (e && e.message));
    }
  }
}
