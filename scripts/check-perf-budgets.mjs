#!/usr/bin/env node
/**
 * Phase 14 (2026-05-12): Performance budget check — `npm run build` 후 호출.
 *
 * 기본 budget (gzip):
 *   - LCP critical path total: < 300KB
 *   - 단일 chunk: < 250KB (recharts 등 vendor 1개)
 *   - CSS total: < 50KB
 *
 * 자동 계산:
 *   - dist/assets/*.js 모두 합 (gzip)
 *   - assets/main.js + vendor-react + vendor-nanostores = initial paint critical
 *   - vendor-recharts = 분석 페이지 lazy (critical 에 포함 안 함)
 *   - vendor-sentry = idle (DSN 없으면 init 안 하지만 로드는 됨)
 *
 * 실패 시 exit 1 → CI fail.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distAssets = join(__dirname, '..', 'dist', 'assets');

const CRITICAL_FILES = ['main.js', 'react.js', 'vendor-react.js', 'vendor-nanostores.js'];
const LAZY_FILES = ['vendor-recharts.js', 'vendor-sentry.js'];

const BUDGETS = {
  critical_total_kb: 100, // initial paint critical total (gzip)
  lazy_total_kb: 200, // vendor-recharts + vendor-sentry total (gzip)
  css_total_kb: 50,
  single_chunk_kb: 250,
};

function file(name) {
  const path = join(distAssets, name);
  try {
    const buf = readFileSync(path);
    return { name, raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  } catch {
    return null;
  }
}

const all = readdirSync(distAssets).map(file).filter(Boolean);

const critical = CRITICAL_FILES.map(file).filter(Boolean);
const lazy = LAZY_FILES.map(file).filter(Boolean);
const css = all.filter((f) => f.name.endsWith('.css'));

const sum = (arr) => arr.reduce((s, f) => s + f.gzip, 0);
const kb = (n) => (n / 1024).toFixed(1);

const criticalTotal = sum(critical);
const lazyTotal = sum(lazy);
const cssTotal = sum(css);
const maxChunk = Math.max(...all.map((f) => f.gzip));
const maxChunkFile = all.find((f) => f.gzip === maxChunk);

console.log('\n📊 Performance budget check\n');
console.log(`Critical (initial paint) : ${kb(criticalTotal)}KB / ${BUDGETS.critical_total_kb}KB`);
critical.forEach((f) => console.log(`  - ${f.name.padEnd(28)} : ${kb(f.gzip)}KB`));
console.log(`\nLazy (분석/sentry)       : ${kb(lazyTotal)}KB / ${BUDGETS.lazy_total_kb}KB`);
lazy.forEach((f) => console.log(`  - ${f.name.padEnd(28)} : ${kb(f.gzip)}KB`));
console.log(`\nCSS total                : ${kb(cssTotal)}KB / ${BUDGETS.css_total_kb}KB`);
console.log(`Max single chunk         : ${kb(maxChunk)}KB (${maxChunkFile.name}) / ${BUDGETS.single_chunk_kb}KB`);

const fails = [];
if (criticalTotal > BUDGETS.critical_total_kb * 1024) fails.push('critical_total');
if (lazyTotal > BUDGETS.lazy_total_kb * 1024) fails.push('lazy_total');
if (cssTotal > BUDGETS.css_total_kb * 1024) fails.push('css_total');
if (maxChunk > BUDGETS.single_chunk_kb * 1024) fails.push('single_chunk');

if (fails.length > 0) {
  console.error(`\n❌ Performance budget 초과: ${fails.join(', ')}`);
  console.error(`   - manualChunks 조정 또는 BUDGETS 갱신 + 사장님 승인`);
  process.exit(1);
}
console.log('\n✅ All performance budgets passed');
