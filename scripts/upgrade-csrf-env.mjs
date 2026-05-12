#!/usr/bin/env node
/**
 * Phase 15 (2026-05-12): Phase 14 의 CSRF 가드 호출 모두 env 까지 전달하도록 upgrade.
 *
 *   checkOriginCsrf(context.request)  →  checkOriginCsrf(context.request, context.env)
 *
 * 사장님이 `?key=ADMIN_KEY` URL 로 정상 admin 진입할 때 bypass 작동.
 * 일반 브라우저 흐름 (cookie + Origin 헤더) 은 영향 0.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminDir = join(__dirname, '..', 'functions', 'api');
const dryRun = process.argv.includes('--dry-run');

let modified = 0;
let totalReplacements = 0;

for (const name of readdirSync(adminDir)) {
  if (!name.endsWith('.js')) continue;
  const path = join(adminDir, name);
  const original = readFileSync(path, 'utf-8');
  /* `checkOriginCsrf(context.request)` → `checkOriginCsrf(context.request, context.env)` */
  const updated = original.replace(
    /checkOriginCsrf\(\s*context\.request\s*\)/g,
    'checkOriginCsrf(context.request, context.env)',
  );
  if (updated !== original) {
    modified++;
    const reps = (original.match(/checkOriginCsrf\(\s*context\.request\s*\)/g) || []).length;
    totalReplacements += reps;
    if (!dryRun) writeFileSync(path, updated);
  }
}

console.log(`\nCSRF env upgrade ${dryRun ? '(DRY)' : ''}`);
console.log(`  files modified : ${modified}`);
console.log(`  calls upgraded : ${totalReplacements}`);
console.log(dryRun ? '\n(no files written)' : '\n✅ done');
