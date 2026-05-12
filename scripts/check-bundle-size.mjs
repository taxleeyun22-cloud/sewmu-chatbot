#!/usr/bin/env node
/**
 * Phase 12 (2026-05-12): Bundle size budget gate.
 *
 * CI 에서 `npm run build` 후 호출. 예산 초과 시 exit 1 → CI fail.
 *
 * 예산 (gzip 기준):
 *   assets/main.js          : 50 KB   (entry — fast 로드)
 *   assets/react.js         : 250 KB  (React + 컴포넌트 — 현재 179KB, 여유)
 *   assets/main.css         : 10 KB
 *   기타 lazy chunk         : 30 KB 개당
 *
 * 사장님이 새 admin 진입 시 LCP 영향 직접. Google: per-bundle budget 강제.
 *
 * 사용:
 *   node scripts/check-bundle-size.mjs
 *   node scripts/check-bundle-size.mjs --json   # CI summary 용 JSON
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

/** key: 매칭 prefix, value: gzip budget KB.
 * Phase 13 (2026-05-12): manualChunks 분리 후 — vendor 청크별 명시 예산. */
const BUDGETS = {
  'assets/main.js': 50,                  // 옛 admin entry (admin-modals 등 글로벌)
  'assets/main.css': 15,                 // Tailwind output
  'assets/react.js': 30,                 // 새 admin app 코드 (vendor 분리 후 — tight)
  'assets/vendor-react.js': 75,          // react + react-dom + scheduler
  'assets/vendor-recharts.js': 120,      // recharts (분석/finance 페이지)
  'assets/vendor-sentry.js': 35,         // @sentry/react + browser
  'assets/vendor-nanostores.js': 5,      // 작음
  'assets/': 30,                         // lazy chunks (filing-review-store 등)
};

const jsonMode = process.argv.includes('--json');

function findFiles(dir, prefix = '') {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (e) {
    console.error(`dist/ 디렉토리 없음 — 'npm run build' 먼저 실행 필요`);
    process.exit(2);
  }
  for (const name of entries) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...findFiles(full, rel));
    } else if (/\.(js|css)$/.test(name)) {
      out.push({ path: rel, full });
    }
  }
  return out;
}

function budgetFor(relPath) {
  /* 최장 prefix 매칭 */
  let best = null;
  for (const [prefix, kb] of Object.entries(BUDGETS)) {
    if (relPath.startsWith(prefix) || relPath === prefix) {
      if (!best || prefix.length > best.prefix.length) {
        best = { prefix, kb };
      }
    }
  }
  return best;
}

const files = findFiles(distDir).sort((a, b) => a.path.localeCompare(b.path));
const results = [];
let failed = 0;

for (const f of files) {
  const raw = readFileSync(f.full);
  const gz = gzipSync(raw, { level: 9 }).length;
  const rel = f.path;
  const budget = budgetFor(rel);
  const ok = !budget || gz <= budget.kb * 1024;
  if (!ok) failed++;
  results.push({
    path: rel,
    raw_bytes: raw.length,
    gzip_bytes: gz,
    budget_kb: budget?.kb ?? null,
    matched_rule: budget?.prefix ?? null,
    ok,
  });
}

if (jsonMode) {
  console.log(JSON.stringify({ failed, files: results }, null, 2));
} else {
  console.log('\n📦 Bundle size budget check\n');
  console.log('File                                Raw       Gzip     Budget   Status');
  console.log('─'.repeat(80));
  for (const r of results) {
    const rawKB = (r.raw_bytes / 1024).toFixed(1) + 'KB';
    const gzKB = (r.gzip_bytes / 1024).toFixed(1) + 'KB';
    const budget = r.budget_kb ? `${r.budget_kb}KB` : '-';
    const status = r.ok ? '✓' : '✗ OVER';
    console.log(
      r.path.padEnd(36) +
        rawKB.padStart(8) +
        '  ' +
        gzKB.padStart(8) +
        '  ' +
        budget.padStart(8) +
        '  ' +
        status,
    );
  }
  console.log('');
  if (failed > 0) {
    console.error(`❌ ${failed} 파일 예산 초과. 위 OVER 항목 검토 필요.`);
    console.error(`   - dynamic import() 로 code-split`);
    console.error(`   - rollupOptions.output.manualChunks 분리`);
    console.error(`   - 또는 BUDGETS (scripts/check-bundle-size.mjs) 조정 + 사장님 승인`);
    process.exit(1);
  }
  console.log(`✅ 모든 번들 예산 통과 (${results.length} 파일)`);
}
