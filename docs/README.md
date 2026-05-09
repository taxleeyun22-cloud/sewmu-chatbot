# 📚 sewmu-chatbot 문서

## 작업 룰

- [CLAUDE.md](../CLAUDE.md) — Claude 작업 규약 (메인)
- [docs/policies/](./policies/) — 개별 룰 파일

## 정책 (policies/)

| 파일 | 설명 |
|---|---|
| [no-auto-permission.md](./policies/no-auto-permission.md) | 사용자 권한·status 자동 변경 금지 |
| [mutation-done.md](./policies/mutation-done.md) | Mutation 후 UI 갱신 절대 룰 |
| [security-rules.md](./policies/security-rules.md) | 보안 절대 규칙 (XSS / CSRF / 민감정보) |
| [no-cloudflare-config.md](./policies/no-cloudflare-config.md) | Cloudflare 대시보드 설정 금지 |
| [no-ui-breakage.md](./policies/no-ui-breakage.md) | UI 박살 방지 |
| [faq-accuracy.md](./policies/faq-accuracy.md) | FAQ 정확성 최우선 |
| [explain-why-first.md](./policies/explain-why-first.md) | "왜" 부터 설명 (Auto Mode 핵심) |

## Architecture Decisions (adr/)

| 번호 | 결정 |
|---|---|
| [001](./adr/001-cloudflare-pages.md) | Cloudflare Pages + D1 + R2 |
| [002](./adr/002-react-migration.md) | React 점진 마이그레이션 + dangerouslySetInnerHTML |
| [003](./adr/003-auto-cache-bust.md) | 자동 cache busting (git hash) |

## 향후 추가 예정

- 004: monorepo (Turborepo) 도입
- 005: Drizzle ORM (D1 schema-as-code)
- 006: Auth.js v5 + RBAC (owner / manager / staff)
- 007: Capacitor 모바일 앱 (iOS / Android)
- 008: Multi-tenancy (SaaS 다중 세무사)
