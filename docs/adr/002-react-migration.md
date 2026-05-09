# ADR 002: React 점진 마이그레이션 + dangerouslySetInnerHTML 패턴

**Status**: Accepted (Phase 3.1, 2026-05-08)
**Decider**: 사장님 + Claude

## Context

기존 admin.html / business.html / index.html = classic script + 점진 React 마이그레이션 필요.

거래처 150+ 매일 사용 중 → downtime 0 + 회귀 위험 ↓ 필수.

## Decision

**Strangler Fig 패턴** + **dangerouslySetInnerHTML 임시 사용**.

각 phase 마다:
1. nanostores `xxx-store.ts` 생성 (atom + helpers + window.__xxxStore 글로벌)
2. classic script (`admin-*.js`) 의 `_buildXxxHtml()` 함수 추출 + window 노출
3. React 컴포넌트 (`Xxx.tsx`) — `useStore + dangerouslySetInnerHTML` 패턴
4. main.tsx 에 `mountAtWithRetry('elementId', () => <Xxx />)` 등록
5. classic script fallback (`if (!window.__xxxStore)` 가드) 유지

## Consequences

**장점**:
- 마크업 + onclick 100% 보존 (사장님 화면 영향 0)
- 회귀 위험 최소 (양쪽 코드 병행)
- Phase 별 commit + 검증 + 롤백 가능

**단점**:
- React 의 본질 (virtual DOM diff) 무력화
- XSS 위험 (HTML string inject)
- 양쪽 코드 (classic + React) 두 개 유지

## 향후 (Phase Infra-1 이후)

새 stack (Next.js 15 + Capacitor) 도입 시 dangerouslySetInnerHTML 100% 제거 + JSX native.

## 진행 현황 (2026-05-09 기준)

- 14 stores: rooms / biz-rooms / messages / filings / filing-review / search / attachments / users / businesses / dashboard / sidebar / memos / shared / 등
- 32 React 컴포넌트
- 555 unit tests
