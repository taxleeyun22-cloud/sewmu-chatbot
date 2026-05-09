/**
 * Phase Next-1.2 (2026-05-09): Drizzle Kit 설정 — Cloudflare D1 호환.
 *
 * 사용:
 *   pnpm --filter @sewmu/db generate  → SQL migration 자동 생성
 *   pnpm --filter @sewmu/db push      → D1 (또는 local) 에 schema 적용
 *
 * 기존 D1 (Lazy ALTER 50곳) 영향 0 — Drizzle 은 schema-as-code 만 추가.
 * 점진 마이그레이션: Lazy ALTER 코드는 유지, 새 코드만 Drizzle 로 작성.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './schema/*.ts',
  out: './migrations',
  // D1 binding 정보는 wrangler.toml 또는 환경변수에서 read
  // 사장님이 Cloudflare 대시보드에서 직접 관리 (CLAUDE.md 룰)
});
