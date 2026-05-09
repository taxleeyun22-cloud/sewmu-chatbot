# ADR 001: Cloudflare Pages + D1 + R2 선택

**Status**: Accepted (Phase 0, 2026-04 초)
**Decider**: 사장님 + Claude

## Context

세무회계 이윤 (대표세무사 1인 + 직원 4명) 의 챗봇 + 사무실 OS 호스팅 결정 필요.

거래처 150+ 매일 사용. 비용 효율 중요. 한국 세무 도메인 → 한국 가까운 region 또는 글로벌 CDN.

## Decision

**Cloudflare Pages** (frontend) + **D1** (DB) + **R2** (file storage) 선택.

## Consequences

**장점**:
- 무료 tier 충분 (D1 5GB, Pages 무제한 build, R2 10GB)
- 글로벌 edge → 한국에서 빠름 (서울/오사카 PoP)
- Worker 환경 = serverless, cold start 거의 0
- 통합 (Pages + Functions + D1 + R2 한 ecosystem)

**단점**:
- D1 = SQLite 기반 — 1000+ 거래처 시 한계 (현재 150 OK)
- Cloudflare lock-in — 다른 클라우드 이전 어려움
- Worker 메모리 한계 (128MB) — 큰 파일 처리 X
- D1 batch transaction 만 (BEGIN/COMMIT 없음)

## 미래 마이그레이션 검토

거래처 1000+ 시:
- D1 → PostgreSQL (Supabase 또는 Neon)
- 또는 Cloudflare Hyperdrive (PostgreSQL 캐싱)

## 관련

- 정책: docs/policies/no-cloudflare-config.md
