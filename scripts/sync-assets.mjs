#!/usr/bin/env node
/**
 * sync-assets.mjs — vite 빌드 결과(dist/assets/*) → apps/admin/public/assets/ 동기화.
 *
 * 배경 (2026-05-18 사장님 종합검증에서 발견):
 *   sewmu-admin(Next.js, apps/admin) 은 apps/admin/public 을 정적 서빙.
 *   classic admin-*.js/html/css 는 sync-mirror.mjs 가 동기화하지만,
 *   vite 빌드 산출물(assets/main.js·react.js·vendor-*.js·main.css)은 sync-mirror
 *   대상이 아님 → apps/admin/public/assets 가 cutover(2026-05-11) 스냅샷에 멈춰
 *   B-1(paste-drop)·#2(img-viewer) 등 main 번들 변경이 sewmu-admin 에 영구 미반영.
 *   (sewmu-chatbot 은 root vite dist 를 직접 서빙해 정상 — sewmu-admin 만 stale.)
 *
 * 해결: 빌드 후 dist/assets/* 전체를 apps/admin/public/assets/ 로 복사.
 *   code-split vendor-*.js 청크까지 통째 (main.js 가 ./vendor-react.js 등 import).
 *   root build postbuild + pre-commit 에서 자동 실행 → drift 영구 차단.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'dist', 'assets');
const DST = join(ROOT, 'apps', 'admin', 'public', 'assets');

if (!existsSync(SRC)) {
  // dist 없으면 (빌드 전) 조용히 패스 — pre-commit 에서 빌드 안 했을 수 있음
  console.log('ℹ️  sync-assets: dist/assets 없음 (빌드 전) — 스킵');
  process.exit(0);
}
if (!existsSync(DST)) mkdirSync(DST, { recursive: true });

/* 대상 = vite 산출 정적 (js/css). map 등은 제외(서빙 불필요). */
const srcFiles = readdirSync(SRC).filter((f) => /\.(js|css)$/.test(f));
const dstFiles = existsSync(DST) ? readdirSync(DST).filter((f) => /\.(js|css)$/.test(f)) : [];

/* 1) dist 에 없어진 옛 파일 제거 (stale 청크 잔존 방지) */
let removed = 0;
for (const f of dstFiles) {
  if (!srcFiles.includes(f)) { rmSync(join(DST, f)); removed++; }
}
/* 2) dist → apps/admin 복사 (변경분만 write) */
let copied = 0;
for (const f of srcFiles) {
  const sb = readFileSync(join(SRC, f));
  const dp = join(DST, f);
  let same = false;
  if (existsSync(dp)) { try { same = readFileSync(dp).equals(sb); } catch { same = false; } }
  if (!same) { writeFileSync(dp, sb); copied++; }
}

if (copied === 0 && removed === 0) {
  console.log('✅ sync-assets: apps/admin/public/assets 최신 (드리프트 0)');
} else {
  console.log('✅ sync-assets: ' + copied + ' 복사' + (removed ? ' / ' + removed + ' 제거' : '') + ' → apps/admin/public/assets (' + srcFiles.length + ' files)');
}
