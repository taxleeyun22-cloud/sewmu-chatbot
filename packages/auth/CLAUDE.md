# packages/auth — Claude 작업 규약 (Auth.js + RBAC)

Auth.js v5 + 자체 admin_key 비번 진입 + RBAC catalog.

## 영역
- `src/providers/` — Kakao / Naver OAuth providers
- `src/drizzle-adapter.ts` — Auth.js Drizzle adapter (users / accounts / verification_tokens)
- `src/rbac.ts` — RBAC catalog (3-tier role / 8 owner-only permissions)
- `src/config.ts` — buildAuthConfig 헬퍼

## 3-tier RBAC (2026-05-08 단순화)

| role | 누구 | 권한 |
|---|---|---|
| **owner** | 사장님 (user_id=1) 또는 ADMIN_KEY | 모든 액션 (8개 owner-only 포함) |
| **admin** | is_admin=1 직원 | 일반 admin 액션 (mutation OK, owner-only X) |
| **customer** | 거래처 (is_admin=0) | 자기 데이터만 |

### 8개 owner-only permissions
- `admin:user:delete` — 사용자 영구 삭제
- `admin:business:cascade_delete` — 업체 + 모든 메모 cascade 삭제
- `admin:memo:bulk_delete` — 메모 일괄 삭제
- `admin:trash:purge` — 휴지통 영구 삭제
- `admin:room:msg_bulk_delete` — 메시지 일괄 삭제
- `admin:bulk_send:send` — 단체발송 (카카오 Biz)
- `admin:rbac:promote` — 관리자 승급
- `admin:rbac:demote` — 관리자 권한 회수

## SSOT (Single Source of Truth)

`packages/auth/src/rbac.ts` 의 PERMISSIONS catalog 가 단일 진실. 옛 admin / 새 admin 양쪽에서 사용:

- 새 admin (TypeScript): `import { PERMISSIONS, hasPermission } from '@sewmu/auth/rbac'`
- 옛 admin (plain JS): `scripts/export-permissions.mjs` 가 build 시 `public/permissions.json` 생성

= 권한 추가/삭제 시 한 곳 (rbac.ts) 만 수정 → 양쪽 자동 반영.

## Auth flow

### 1) 사장님 비번 진입 (admin_key_auth cookie)
- POST `/api/admin-login` body `{ key: ADMIN_KEY }`
- 검증 OK → HMAC-SHA256 서명된 admin_key_auth cookie 7일 (HttpOnly + Secure + SameSite=Lax)
- middleware: cookie 존재 + 서명 검증 → role='owner' 자동
- 로그아웃: `/api/admin-logout` → cookie 삭제

### 2) 직원 카톡 OAuth (Auth.js)
- `/api/auth/signin/kakao` → 카톡 동의 페이지
- callback → `accounts` 테이블 insert + `users` upsert
- session cookie: `authjs.session-token` (또는 `__Secure-authjs.session-token`)
- middleware: session 검증 + users.is_admin / staff_role 로 role 결정

### 3) 거래처 카톡 OAuth (옛 admin)
- `/api/auth/start/kakao` → 옛 admin 의 카카오 OAuth 시작
- session cookie: `session` (sessions 테이블)
- users.is_admin=0 → role='customer'

## Kakao OAuth scope (KOE205 fix)

기본 scope: `profile_nickname account_email`
- ⚠️ `name` / `phone_number` 는 카카오 비즈 앱 인증 필요 (개인 앱은 KOE205)
- 사장님 직접 카카오 디벨로퍼 콘솔에서 비즈 인증 완료 후 scope 확장

## 🔐 보안 절대 규칙

### 절대 하지 말 것
- ❌ 주민등록번호·카드번호·홈택스 비번 등 민감정보를 **localStorage / sessionStorage / cookie / IndexedDB** 에 저장
- ❌ base64 인코딩을 "암호화"로 취급 (실제 AES-GCM + KMS 없으면 저장 거부)
- ❌ ADMIN_KEY·세션 토큰을 로그·에러 응답·URL parameter 에 노출
- ❌ OAuth/API 에러 응답에 `e.message`, `client_id`, `redirect_uri`, 스택 트레이스 (항상 중립 메시지)
- ❌ 사용자 제공 URL (image_url/file_url/endpoint 등) 을 검증 없이 DB 저장
- ❌ 프론트 권한 숨김만으로 끝내고 서버 검증 누락

### 필수
- ✅ 모든 변경·조회 API 는 서버에서 세션 또는 ADMIN_KEY 검증 + 소유권/멤버십 확인
- ✅ 업로드 파일은 MIME+확장자 화이트리스트, 크기 상한, 경로 구분자·제어문자 제거
- ✅ R2 키는 `crypto.randomUUID()` 기반 CSPRNG (Math.random 금지)
- ✅ `/api/image`, `/api/file` 프록시는 세션 또는 ADMIN_KEY 요구
- ✅ 민감 컬럼 (주민번호 등) 은 DB 에 마스킹 저장 (앞 6자리만, 뒤 전체 `*`)
- ✅ `_headers` 에 CSP, X-Frame-Options DENY, HSTS, Referrer-Policy 전역 적용

## 단위 테스트

- `src/rbac.test.ts` — PERMISSIONS catalog (33 tests)
- `src/drizzle-adapter.test.ts` — Auth.js adapter (24 tests)
- `src/providers/providers.test.ts` — OAuth providers (11 tests)
- `src/config.test.ts` — buildAuthConfig (11 tests)
