#!/usr/bin/env node
/**
 * Phase 14 (2026-05-12): 옛 admin endpoint 일괄 CSRF 가드 적용.
 *
 * 패턴 (각 onRequestPost/Put/Delete/Patch 함수에):
 *   - import 라인에 checkOriginCsrf 추가
 *   - 함수 본문 첫 줄에 가드 삽입 (이미 있으면 skip)
 *
 * 사용:
 *   node scripts/apply-csrf-guard.mjs           # 적용
 *   node scripts/apply-csrf-guard.mjs --dry-run # 미리보기
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminDir = join(__dirname, '..', 'functions', 'api');
const dryRun = process.argv.includes('--dry-run');

const GUARD_SNIPPET = `  /* Phase 14 (2026-05-12): CSRF Origin/Referer 가드 — 일괄 적용. */
  const __csrf = checkOriginCsrf(context.request);
  if (__csrf) return __csrf;
`;

let stats = {
  scanned: 0,
  alreadyDone: 0,
  modified: 0,
  importAdded: 0,
  guardInserted: 0,
  noMutation: 0,
};

/**
 * src 안 각 mutation 함수 본문에 가드 삽입 — 이미 있으면 skip.
 * regex 로 함수 시작 매칭 → 다음 줄 검사.
 */
function injectGuards(src) {
  const re =
    /(export\s+async\s+function\s+onRequest(?:Post|Put|Delete|Patch)\s*\(\s*context\s*\)\s*\{\r?\n)/g;
  let inserted = 0;
  const out = src.replace(re, (match, header, offset) => {
    /* 함수 본문 다음 ~200자 안에 checkOriginCsrf 호출이 이미 있는지 확인 */
    const afterStart = offset + match.length;
    const peek = src.slice(afterStart, afterStart + 400);
    if (/checkOriginCsrf\s*\(\s*context\.request\s*\)/.test(peek)) {
      return header; // 이미 가드 있음 (Phase 13 또는 Phase 14)
    }
    inserted++;
    return header + GUARD_SNIPPET;
  });
  return { src: out, inserted };
}

/** import 라인에 checkOriginCsrf 보장. */
function ensureImport(src) {
  if (/\bcheckOriginCsrf\b.*from\s*["']\.\/_adminAuth/.test(src)) {
    return { src, added: false };
  }
  /* _adminAuth import 안에 함수 추가 */
  const importRe =
    /import\s*\{([^}]+)\}\s*from\s*["']\.\/_adminAuth(?:\.js)?["']/;
  const m = importRe.exec(src);
  if (m) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.includes('checkOriginCsrf')) names.push('checkOriginCsrf');
    const newImport = `import { ${names.join(', ')} } from "./_adminAuth.js"`;
    return { src: src.replace(importRe, newImport), added: true };
  }
  /* _adminAuth import 자체 없음 — 최상단에 추가 */
  return {
    src: `import { checkOriginCsrf } from "./_adminAuth.js";\n` + src,
    added: true,
  };
}

function processFile(filePath) {
  stats.scanned++;
  const original = readFileSync(filePath, 'utf-8');
  let src = original;

  /* mutation 함수 없으면 skip */
  if (!/export\s+async\s+function\s+onRequest(?:Post|Put|Delete|Patch)/.test(src)) {
    stats.noMutation++;
    return;
  }

  /* 가드 삽입 — 이미 있는 함수는 자동 skip */
  const r = injectGuards(src);
  src = r.src;
  if (r.inserted === 0) {
    /* 모든 함수가 이미 가드 있음 — import 만 보장 */
    if (/\bcheckOriginCsrf\b/.test(src)) {
      stats.alreadyDone++;
      return;
    }
  }
  stats.guardInserted += r.inserted;

  /* import 보장 */
  const im = ensureImport(src);
  src = im.src;
  if (im.added) stats.importAdded++;

  if (src !== original) {
    stats.modified++;
    if (!dryRun) writeFileSync(filePath, src);
  }
}

const files = readdirSync(adminDir)
  .filter((n) => n.startsWith('admin-') && n.endsWith('.js'))
  .map((n) => join(adminDir, n));

for (const f of files) {
  try {
    processFile(f);
  } catch (e) {
    console.error(`failed: ${f} — ${e.message}`);
  }
}

console.log('\n=== CSRF guard apply ' + (dryRun ? '(DRY RUN)' : '') + ' ===');
console.log(`Scanned         : ${stats.scanned}`);
console.log(`No mutation     : ${stats.noMutation}`);
console.log(`Already done    : ${stats.alreadyDone}`);
console.log(`Import added    : ${stats.importAdded}`);
console.log(`Guards inserted : ${stats.guardInserted}`);
console.log(`Modified files  : ${stats.modified}`);
console.log(dryRun ? '\n(no files written — run without --dry-run to apply)' : '\n✅ done');
