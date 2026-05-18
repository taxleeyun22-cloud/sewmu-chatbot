#!/usr/bin/env node
/**
 * build-modals.mjs — modals/*.html 파티션 → admin-modals.html 단일 파일 concat 빌드.
 *
 * 배경 (모듈화 #1, 2026-05-18 사장님 "장기적으로 쪼개기 모듈화해야된다"):
 *   admin-modals.html(1901줄, 모달 ~40개) 단일 monolith → 기능 그룹별 파티션으로 분리.
 *   런타임은 admin.html/business.html 이 /admin-modals.html 1개를 fetch+inject 하므로
 *   서빙 파일은 그대로 유지해야 함(회귀 0). → 소스만 modals/ 로 쪼개고 빌드시 concat.
 *
 * 핵심 안전장치: Buffer(byte) 단위 concat — CRLF 보존, 재조합 == 원본 byte-identical.
 *   build 후 `git diff admin-modals.html` 가 비어야(0 변화) 런타임 회귀 0 객관 증명.
 *   admin-modals.html 은 이제 "생성 아티팩트" — 직접 수정 금지, modals/ 만 편집.
 *
 * 실행: prebuild + pre-commit 에서 자동. 수동: node scripts/build-modals.mjs [--check]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'modals');
const OUT = join(ROOT, 'admin-modals.html');

if (!existsSync(SRC_DIR)) {
  console.error('❌ build-modals: modals/ 디렉토리 없음');
  process.exit(1);
}

/* 파일명 정렬 순서 = concat 순서 (00-/10-/20- prefix 로 결정적). */
const files = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.html'))
  .sort();

if (!files.length) {
  console.error('❌ build-modals: modals/*.html 파티션 없음');
  process.exit(1);
}

const buf = Buffer.concat(files.map((f) => readFileSync(join(SRC_DIR, f))));

const check = process.argv.includes('--check');
const prev = existsSync(OUT) ? readFileSync(OUT) : Buffer.alloc(0);
const identical = prev.equals(buf);

if (check) {
  if (identical) {
    console.log('✅ build-modals --check: admin-modals.html 최신 (파티션과 일치)');
    process.exit(0);
  }
  console.error('❌ build-modals --check: admin-modals.html 가 파티션과 불일치 (재빌드 필요)');
  process.exit(1);
}

if (identical) {
  console.log('✅ build-modals: 변화 없음 (' + files.length + ' 파티션, ' + buf.length + ' bytes)');
} else {
  writeFileSync(OUT, buf);
  console.log('✅ build-modals: admin-modals.html 재생성 (' + files.length + ' 파티션, ' + buf.length + ' bytes)');
  console.log('   ' + files.join(' → '));
}
