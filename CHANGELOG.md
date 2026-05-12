# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to time-versioned releases (no semver — internal admin
tool, prod is sewmu-chatbot.pages.dev / sewmu-admin.pages.dev).

## [Unreleased]

### Added

- Phase 12 (2026-05-12): CI/CD foundation — `.github/workflows/ci.yml`
  (typecheck + vitest + build + bundle size budget gate), `.github/workflows/e2e.yml`
  (월요일 scheduled + manual Playwright), `.github/CODEOWNERS`, PR template,
  `.github/dependabot.yml` (주간 minor/patch + 월 GH Actions)
- Phase 12: `scripts/check-bundle-size.mjs` — assets/main.js < 50KB gzip,
  react.js < 250KB gzip, lazy chunks < 30KB gzip 강제 (Google bundle budget 패턴)
- Phase 12: CHANGELOG.md (keep-a-changelog) — 사장님 + 향후 직원 변경 추적

## [2026-05-12] — Phase 11 UI cleanup

### Added

- `apps/admin/lib/format.ts` 단일 진실 소스 (32 tests) — formatDateTime /
  formatDate / formatRelative / formatWon / formatNumber / formatCompactNumber /
  formatUserName / formatUserNameWithId / truncate. Intl.DateTimeFormat
  (Asia/Seoul), null/NaN safe, Unicode-safe truncate.
- `apps/admin/components/ui/confirm-dialog.tsx` (9 tests) — shadcn AlertDialog
  imperative API (`await confirm({...})`). role="alertdialog" + aria-labelledby +
  ESC/Enter/auto-focus cancel.
- `apps/admin/components/sidebar-badge.test.ts` (5 tests) +
  `apps/admin/app/admin/dashboard/badge-helpers.{ts,test.ts}` (8 tests) —
  Google audit "0 component tests" 지적 fix.
- `apps/admin/lib/hooks/useDebouncedValue.ts` (4 tests) — users 검색 250ms debounce.

### Changed

- Toast a11y 강화 (7 tests) — role status/alert + aria-live polite/assertive +
  닫기 버튼 + ESC dismiss + error 최소 5초 + WCAG AA amber-400 + timer leak fix.
- Sidebar 모바일 drawer (768px ↓ 햄버거 + backdrop + ESC + auto-close).
- admin layout 모바일 top bar + 햄버거 (Menu lucide).
- users page `confirm()` → ConfirmDialog (destructive variant).
- `apps/admin/components/providers.tsx` 에서 Toaster + ConfirmDialog 단일 mount
  (이전 layout.tsx + providers.tsx 중복 mount 제거).
- `vitest.config.ts` alias 배열로 `@/lib/*` `@/components/*` apps/admin 매핑
  (이전 `@` catch-all 만 → apps/admin 테스트 깨졌던 거 fix).
- `apps/admin/tsconfig.json` — `*.test.{ts,tsx}` 제외 (vitest 가 typecheck).

## [2026-05-12] — Phase 10 cleanup (Google audit 반영)

### Fixed

- **보안**: `packages/api/src/routers/error-logs.ts` 공개 procedure 에서
  `e.message` raw 노출 제거 → `'log_insert_failed'` 중립 메시지. CLAUDE.md
  `packages/auth` 룰 ("에러 응답 항상 중립 메시지") 준수.
- logger emit fallback — circular ref 시 ctx/err 통째 lost 되던 거 fix
  (WeakSet 기반 `safeStringify` + `[Circular]` sentinel + schemaVersion 보존).
- e2e dashboard/users/businesses 가 가짜 cookie `admin_key_auth=1` 로 chrome 만
  통과시키던 "test theatre" 제거. `e2e/fixtures/auth.ts` — 실 HMAC cookie 받음.
  `E2E_ADMIN_KEY` 미설정 시 honest skip.
- `mentions.ts` XSS escape 5문자 (& < > " ') 적용 (이전 `"` 만).
- logger.ts `||` → `??` + `calculateRole` (auth 패키지) 위임 (3중 중복 → 단일).

### Added

- `packages/api/src/trpc.ts` — `errorLoggingMiddleware` 모든 procedure 자동 적용
  (TRPCError 는 비즈 흐름이라 패스, uncaught 만 logger.error).
- logger `LOG_LEVEL` env 필터 (debug/info/warn/error/fatal — prod cost 절감).
- logger `LogEntry.schemaVersion` (1) + Error.cause 직렬화 + bigint 안전 직렬화.

### Removed

- `logger.logToD1` dead export (어디서도 호출 안 됨).
- `message-parser.ts` dead `eslint-disable @typescript-eslint/no-explicit-any`.

## [2026-05-12] — Phase 7-8

### Added

- `packages/api/src/logger.ts` 구조화 로깅 (Sentry-ready) + 15 tests —
  logger.info/warn/error/fatal + logCtx (tRPC ctx 추출). Cloudflare Workers
  console → Logpush JSON 호환.
- `src/admin/mentions.ts` (26 tests) — admin.js @mention 자동완성 TS 모듈.
- `src/admin/message-parser.ts` (38 tests) — admin.js parseMsg / linkify /
  fileIconFor / fmtSize TS 모듈.
- `e2e/01-login.spec.ts` ~ `e2e/05-businesses.spec.ts` (5 spec) — Playwright
  사장님 매일 워크플로 자동 검증.
- `playwright.config.ts` — Chromium / 1440x900 / ko-KR / Asia/Seoul.
- silent catch → logger 적용 — `chat.ts` (RAG fail) / `faq.ts` (embedding fail) /
  `error-logs.ts` (meta-logger) / `audit.ts` (audit fail).

### Changed

- `packages/api/src/trpc.ts` — `db: any` → `D1Database`, `bucket?: any` → `R2Bucket`.
- `packages/api/src/routers/chat.ts` — `DrizzleDb = ReturnType<typeof drizzle>` 타입
  정의 + `as any` 제거.

## [2026-05-11] — Phase Next-Day28

### Added

- 노션 5단계 권한 (owner / admin / editor / viewer / customer) +
  `users.admin_role` 컬럼 + permission catalog 9개 owner-only.
- 옛 admin.html 에 카톡 로그인 버튼 (`/api/auth/start?provider=kakao&from=admin`).
- customer.dashboard + customer.businessDashboard tRPC procedures (9 / 6
  parallel D1 queries).
- 사이드바 카운트 6개 추가 (rejectedUsers / terminatedUsers / adminUsers /
  businesses / memosTotal / trash) + customer router integration tests (10).

### Fixed

- list limit 200 → 1000/2000 (사장님 257 거래처 + 310 업체 표시).
- tRPC query 가 옛 admin raw SQL 과 동등 (deleted_at + is_admin 처리).

---

<sub>이 파일은 `git log --oneline` 보다 사람-읽기 좋은 변경 이력. Phase 별
주요 변경 + 보안/회귀 fix 강조. 매 commit 마다 갱신할 필요 X — 1-2주 단위로
[Unreleased] → 날짜 헤더 cut.</sub>
