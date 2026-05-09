# 🔐 보안 절대 규칙

**시행**: 2026-04-21 강화

## 절대 하지 말 것

- ❌ 주민등록번호·카드번호·홈택스 비번 등 민감정보를 **localStorage/sessionStorage/cookie/IndexedDB**에 저장
- ❌ base64 인코딩을 "암호화"로 취급 (실제 AES-GCM + KMS 없으면 저장 자체를 거부)
- ❌ ADMIN_KEY·세션 토큰을 로그·에러 응답·URL 파라미터로 노출
- ❌ OAuth/API 에러 응답에 `e.message`, `client_id`, `redirect_uri`, 스택 트레이스 반환 (항상 중립 메시지)
- ❌ 사용자 제공 URL(image_url/file_url/endpoint 등)을 검증 없이 DB에 저장
- ❌ 프론트 권한 숨김만으로 끝내고 서버 검증 누락
- ❌ `e()` 같은 text-only escape를 **속성 문맥**(`value="${}"`)에 사용 (반드시 `escAttr` 사용)

## 필수

- ✅ 모든 변경·조회 API는 서버에서 세션 또는 ADMIN_KEY 검증 + 소유권/멤버십 확인
- ✅ 업로드 파일은 MIME+확장자 화이트리스트, 크기 상한, 경로 구분자·제어문자 제거
- ✅ R2 키는 `crypto.randomUUID()` 기반 CSPRNG (Math.random 금지)
- ✅ `/api/image`, `/api/file` 프록시는 세션 또는 ADMIN_KEY 요구
- ✅ 민감 컬럼(주민번호 등)은 DB에 마스킹 저장 (앞 6자리만, 뒤 전체 `*`)
- ✅ `_headers`에 CSP, X-Frame-Options DENY, HSTS, Referrer-Policy 전역 적용

## 알려진 위험 (개선 대기)

- ⚠️ ADMIN_KEY 단일 신뢰점 → 별도 phase 에서 OAuth 2.0 + service account 도입 예정
- ⚠️ user_id=1 하드코딩 (사장님 = 1번) → users.is_owner flag 마이그레이션 예정
- ⚠️ XSS 가능성: `innerHTML + string concat` 132줄, `onclick=...` inline 70곳 → React 점진 마이그레이션 중
