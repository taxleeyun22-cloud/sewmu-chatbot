// Phase Next-Day28 (2026-05-11): functions/api/[file].js -> Next.js app/api/[name]/route.ts.
// 사장님 명령: "그냥복사말고 넥스트js변환하면서 복사란거지" — wrapper 패턴.
//
// 옛 패턴 (Cloudflare Pages Functions): export async function onRequestGet(context)
// 새 패턴 (Next.js App Router, edge runtime): export async function GET(request)
//
// 실행: node scripts/generate-api-routes.mjs
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const LEGACY_DIR = path.join(PROJECT_ROOT, 'functions/api');
const OUT_DIR = path.join(PROJECT_ROOT, 'app/api');

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options'];

/** 한 .js 파일 분석 → 어떤 메서드 export 했는지 + 다이나믹 path 검출 */
async function analyze(filepath) {
  const src = await readFile(filepath, 'utf8');
  const methods = HTTP_METHODS.filter((m) =>
    new RegExp(`export\\s+async\\s+function\\s+onRequest${m}\\b`).test(src),
  );
  // onRequest (no method, default) 도 확인
  const hasDefault = /export\s+async\s+function\s+onRequest\s*\(/.test(src);
  return { methods, hasDefault };
}

/** route.ts 생성 */
function buildRouteCode(relImport, methods, hasDefault) {
  const imports = [];
  if (hasDefault) imports.push('onRequest');
  for (const m of methods) imports.push(`onRequest${m}`);
  const importList = imports.length > 0 ? imports.join(', ') : '';

  const exportLines = [];
  const allMethods = methods.length > 0 ? methods : (hasDefault ? HTTP_METHODS : []);
  for (const m of allMethods) {
    const upper = m.toUpperCase();
    const fnName = methods.includes(m) ? `onRequest${m}` : 'onRequest';
    exportLines.push(
      `export async function ${upper}(request: Request) {`,
      `  return callLegacy(${fnName} as any, request);`,
      `}`,
      '',
    );
  }

  return [
    `/**`,
    ` * Auto-generated wrapper (2026-05-11): 옛 functions/api/*.js → Next.js route.ts`,
    ` * 사장님 명령 "Next.js 변환하면서 복사".`,
    ` */`,
    `export const runtime = 'edge';`,
    ``,
    `import { callLegacy } from '@/lib/cf-context';`,
    importList
      ? `import { ${importList} } from '${relImport}';`
      : `import * as legacy from '${relImport}';`,
    ``,
    ...exportLines,
  ].join('\n');
}

/** functions/api/ → app/api/ path 변환
 * 예: admin-whoami.js → app/api/admin-whoami/route.ts
 *     auth/kakao.js → app/api/auth/kakao/route.ts
 */
function targetPath(legacyRel) {
  // 옛: admin-whoami.js → admin-whoami
  // 옛: auth/kakao.js → auth/kakao
  const dropExt = legacyRel.replace(/\.js$/, '');
  return path.join(OUT_DIR, dropExt, 'route.ts');
}

async function walkLegacy(dir, rel = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkLegacy(fullPath, relPath)));
    } else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) {
      // skip helpers (_adminAuth.js, _audit.js, ...) — 직접 사용 X
      files.push(relPath);
    }
  }
  return files;
}

async function main() {
  const legacyFiles = await walkLegacy(LEGACY_DIR);
  console.log(`Found ${legacyFiles.length} legacy endpoints`);

  let generated = 0;
  let skipped = 0;
  for (const legacyRel of legacyFiles) {
    const legacyFull = path.join(LEGACY_DIR, legacyRel);
    const { methods, hasDefault } = await analyze(legacyFull);

    if (methods.length === 0 && !hasDefault) {
      console.log(`  ⊘ skip (no onRequest): ${legacyRel}`);
      skipped++;
      continue;
    }

    const out = targetPath(legacyRel);
    await mkdir(path.dirname(out), { recursive: true });

    // 상대 import path 계산 (apps/admin/app/api/foo/route.ts → ../../../functions/api/foo.js)
    const outDir = path.dirname(out);
    const legacyRelFromOut = path.relative(outDir, legacyFull).replace(/\\/g, '/');

    const code = buildRouteCode(legacyRelFromOut, methods, hasDefault);
    await writeFile(out, code, 'utf8');
    generated++;
    console.log(`  ✓ ${legacyRel} → app/api/${legacyRel.replace(/\.js$/, '')}/route.ts [${[hasDefault && 'ALL', ...methods].filter(Boolean).join('/')}]`);
  }

  console.log(`\nGenerated ${generated} routes, skipped ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
