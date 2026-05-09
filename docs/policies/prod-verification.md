# 🚨 Prod 검증 절대 룰

**시행**: 2026-05-09 (사장님 5시간 사고 발견)

## 과거 사고

2026-05-09: Phase 2.1 ~ 3.14 + Infra-1 등 5시간 동안 13건 commit 모두 Cloudflare 빌드 실패.
- 원인: nanostores peer dep 충돌
- Claude 가 검증한 것: `npm test PASS + curl prod 200`
- 놓친 것: **Cloudflare Deployments 탭에서 commit hash 가 ✅ 인지 안 봄**
- 결과: 사장님이 5시간 동안 옛 코드 보고 있었음 + 새 기능 0

## 룰 (절대)

### push 후 검증 = 3단계 모두 필수

#### 1️⃣ npm test PASS (로컬, 기존)
- 회귀 자동 차단

#### 2️⃣ Cloudflare Deployments 확인 (신규 — 가장 중요)
- https://dash.cloudflare.com → Workers & Pages → sewmu-chatbot → Deployments
- 가장 최근 commit hash 옆 **✅ Production** 인지 확인
- ⚠️ **No deployment available** 이면 빌드 실패 — 즉시 logs 확인 + fix

#### 3️⃣ 실제 기능 작동 확인 (curl 200 X)
- ❌ `curl /admin.html` 200 = "옛 deployment 가 정상" 만 의미
- ✅ 사장님이 새로고침 후 **새 기능 작동 확인**
  - 또는 Playwright smoke test 5개 자동
  - 또는 commit hash 가 HTML asset URL 에 들어가 있는지 (auto-cache-bust)

## 자동화 (TODO)

### Sentry release tracking
- 매 deploy 시 release version (git hash) 자동 등록
- prod 에서 새 버전이 진짜 작동하는지 확인 (Sentry 가 알려줌)

### GitHub Actions smoke.yml 강화
- 현재: curl 200 만 확인
- 강화: HTML 안 `?v=<expected hash>` 검증 (배포 진짜 됐는지)

### Discord/Slack 빌드 실패 알림
- Cloudflare Pages → Build notifications
- 빌드 실패 시 사장님 폰 즉시 알림 (Discord webhook)
- = 5시간 사고 같은 거 5분 안에 발견

## 위반 시

- 사장님이 새 기능 작동 안 한다고 발견 후 보고
- Claude 가 "왜 안 됨?" 디버그 시작 → 원인 = 빌드 실패 (이미 실패해 있었음)
- 시간 손해 + 신뢰 ↓

## 핵심

> "**push 후 commit hash 가 prod 에 진짜 떠있는지 확인. curl 200 만 보지 말 것.**"
