<!-- Phase 12 (2026-05-12): PR template — Google-grade review 강제. -->

## 변경 요약 (1-2줄)

<!-- 무엇을 / 왜. 사장님 보고 톤. 예: "거래처 대시보드에 부가세 D-day 카드 추가 — 사장님 매일 진입 시 임박 확인." -->

## 변경 내용

- [ ] 신규 기능 / 추가
- [ ] 버그 fix
- [ ] 리팩토링 (동작 변경 X)
- [ ] 디자인 / UI
- [ ] 인프라 / CI / 빌드
- [ ] 보안 / 권한
- [ ] 문서

## 검증

- [ ] `npm run typecheck` 통과
- [ ] `npm test` 통과 (회귀 0)
- [ ] `npm run build` 통과 + 번들 사이즈 budget 만족
- [ ] (UI 변경 시) prod 화면 검증 — 스크린샷 첨부
- [ ] (DB 스키마 변경 시) `packages/db/migrations/` 에 신규 .sql 파일 추가 + 사장님 확인
- [ ] (보안/권한 변경 시) `packages/auth/CLAUDE.md` 룰과 일치
- [ ] (RBAC 변경 시) `permissions.json` 재생성 + 검토

## 영향 범위

- [ ] 옛 admin (admin.html) 회귀 X
- [ ] 새 admin (apps/admin) 회귀 X
- [ ] 거래처 챗봇 (index.html) 회귀 X
- [ ] mutationDone 룰 적용 (mutation 후 UI 갱신)

## 보안 / 개인정보

- [ ] PII (전화/이메일/실명) 로깅 안 함
- [ ] 공개 procedure 에서 `e.message` raw 노출 안 함
- [ ] 새 cookie 는 HttpOnly + Secure + SameSite=Lax

## 사장님 확인 사항

<!-- 명시 OK 필요한 항목 — 권한 변경 / status 자동 SET / 데이터 삭제 등 -->

## 관련 자료

<!-- 디자인 doc / 사장님 명령 인용 / 관련 PR -->

---

<sub>Google admin checklist Phase 12 — 이 항목 채워지지 않은 PR 는 reviewer 가 자동 차단.</sub>
