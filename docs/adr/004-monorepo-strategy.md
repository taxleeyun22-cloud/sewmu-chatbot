# ADR 004: Monorepo 전략 (Week 1 시작)

**Status**: Accepted (2026-05-09)
**Decider**: 사장님 + Claude

## Context

오늘 (2026-05-09) 발견된 회귀 사고 3건:
1. 사용자 list 검색 깨짐 (Phase 3.1.B 부작용)
2. 업체 탭 stuck (Phase 3.2.B 부작용)
3. business.html ReferenceError (script 의존성 불일치, Sentry 첫 발견)

**공통 원인**: classic script + React (dangerouslySetInnerHTML) 충돌 + 파편 페이지의 script 로딩 불일치.

= 점진 마이그레이션 누적 부채 폭발. 더 깊이 가면 회귀 가속.

## Decision

**Strangler Fig 패턴** + **Next.js 15 + Turborepo monorepo**.

### 폴더 구조

```
sewmu-chatbot/
├─ apps/                      # Week 1 신규
│   ├─ customer-web/          # Next.js 15 — 거래처 챗봇 (Week 2-3)
│   ├─ admin/                 # Next.js 15 — 사장님 admin (Week 4-5)
│   └─ business/              # Next.js 15 — 거래처 dashboard (Week 5-6)
├─ packages/                  # Week 1 신규
│   ├─ db/                    # Drizzle ORM schema (D1 reverse-engineer)
│   ├─ ui/                    # shadcn/ui 공통 컴포넌트
│   ├─ auth/                  # Auth.js v5 (Week 2 시작)
│   ├─ api/                   # tRPC routers (Week 2-3 시작)
│   └─ types/                 # Zod schemas
├─ admin.html                 # ← 옛 시스템 (Week 6 cutover 까지 그대로)
├─ admin.js / admin-*.js      # ← 그대로
├─ business.html              # ← 그대로
├─ index.html                 # ← 그대로
├─ functions/api/*.js         # ← 그대로
└─ vite.config.ts             # ← 그대로
```

### 6주 timeline (사장님 합의)

| 주 | 작업 | downtime |
|---|---|---|
| 1 | 인프라 + Drizzle + shared (지금) | 0 |
| 2 | apps/customer-web | 0 (staging 만) |
| 3 | customer cutover | 5분 |
| 4 | apps/admin 1단계 | 0 |
| 5 | apps/admin 2단계 | 0 |
| 6 | admin cutover + cleanup | 5분 |

## Consequences

### 장점
- ✅ classic script + React 충돌 패턴 사라짐
- ✅ dangerouslySetInnerHTML 폐기
- ✅ TypeScript strict 100%
- ✅ File-based routing (script 의존성 자동)
- ✅ Tailwind + shadcn/ui (디자인 시스템)
- ✅ Drizzle ORM (Lazy ALTER 50곳 폐기)
- ✅ tRPC (typed API)
- ✅ 사장님 매일 사용 OK (Strangler Fig)

### 단점
- ⚠️ 6주 시간
- ⚠️ Claude 토큰 비용 약 $3,000-5,000
- ⚠️ cutover 2번 (Week 3 + Week 6) 5분씩 영향

### 위험 완화
- 매주 staging 검증 → 사장님 OK 후 cutover
- Cloudflare Pages 1-click rollback (5초)
- 옛 시스템 1주 backup (Week 7 까지)
- 기존 데이터 (D1 + R2) 그대로 — schema 변경 0

## 관련

- ADR 002: React 점진 마이그레이션 (이 ADR 로 대체됨)
- 정책: docs/policies/prod-verification.md
- 정책: docs/policies/explain-why-first.md
