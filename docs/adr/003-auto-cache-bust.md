# ADR 003: 자동 cache busting (git commit hash)

**Status**: Accepted (Phase Infra-1, 2026-05-09)

## Context

기존 패턴: 매 commit 마다 `admin.html` 의 `<script src="/admin.js?v=185">` 수동 ++.

문제:
- 매 commit 5-10초 손작업 + 실수 위험 (빼먹으면 사용자 옛날 캐시)
- 30+ 곳 (admin.js / admin-*.js 10+ / main.js / react.js / main.css 등)

## Decision

**Vite plugin (autoCacheBustPlugin)** 으로 자동화:
1. build 시 `git rev-parse --short HEAD` → version
2. `dist/` 안 모든 HTML 의 `?v=숫자` 정규식 → `?v=<hash>`
3. 매 commit 시 자동 변경 (변경 없는 commit 은 같은 hash → cache 유지 효율)

## Consequences

**장점**:
- 매 commit 작업 5-10초 → 0
- 빼먹기 0 (정규식 자동)
- 변경 안 한 file 은 cache 유지 (사용자 효율)

**단점**:
- git 없는 환경 (CI 외) 에서 timestamp fallback
- Cloudflare Pages 빌드 시 git history 필요 (default OK)

## 구현

`vite.config.ts` 의 `autoCacheBustPlugin()` plugin.
