# 세무회계 이윤 AI 세무 챗봇 — Claude 작업 규약

대구 달서구 세무회계 이윤(대표세무사 이재윤)의 AI 세무 상담 챗봇.
Cloudflare Pages + D1 DB + OpenAI GPT-4.1-mini + 국가법령정보센터 API.

## 사용자 정보
- 대표세무사 (기장 거래처 150+ 보유)
- 상용화 진행 중

## 협업 규약

### FAQ/지식 추가는 Claude가 주도
1. Claude가 추가할 FAQ 항목 **먼저 제안**
2. Claude가 법령·실무 기준으로 **스스로 검증**
3. 사용자 OK 후 `functions/api/chat.js` 시스템 프롬프트에 하드코딩

### `거래처 PDF 처리해줘 [거래처명/user_id]` 처리 절차 📄
세무사님이 `finance_pdfs/{user_id}/` 폴더에 세무조정계산서·부가세 신고서 PDF를 push 후 Claude한테 요청 → Claude가 다음 순서로 처리:

1. **거래처명·user_id 매핑**: 거래처명만 받았으면 D1 `users` 테이블에서 조회 (또는 user_id를 같이 알려줌)
2. **PDF 위치 확인**: 저장소의 `finance_pdfs/{user_id}/` 디렉터리에서 PDF 목록 (`Glob`)
3. **텍스트 추출**: `pdftotext "<file>" -` 명령으로 본문 텍스트 (Bash)
4. **재무 항목 파싱**: 매출/매입/부가세/소득세/과세표준/인건비 등 추출
   - 세무조정계산서 → 매출(영업수익), 매입(매출원가+판관비), 과세표준, 산출세액
   - 부가세 신고서 → 매출세액, 매입세액, 납부세액, 사업기간(예 2026-1기)
   - 종소세 신고서 → 종합소득금액, 산출세액, 결정세액
5. **JSON 행 생성**: `{ user_id, period, period_type, revenue, cost, vat_payable, income_tax, taxable_income, payroll_total, source: 'pdf', source_file: 'xxx.pdf' }`
6. **DB 적재**: 사용자에게 미리보기 보여주고 승인받은 뒤 SQL migration 작성 → commit
   - 또는 `/api/admin-finance?action=bulk_import&key=ADMIN_KEY` 형식
7. **결과 보고**: 추가 N건 / 갱신 M건 / 실패 K건 + 어느 PDF에서 어느 기간이 들어갔는지 표

**원칙**: OpenAI API 비용 0. PDF 분석은 Claude(나)가 직접 텍스트 보고 추출.

**관련 엔드포인트**:
- `functions/api/admin-finance.js` — `client_finance` 테이블 CRUD (GET, POST upsert/bulk_import/delete, GET ?action=summary)

### `flagged-items.json` 처리 절차 ⭐
사용자가 **"flagged-items.json 처리해줘"** 라고 하면 아래를 정확히 실행:

1. 저장소 루트의 `flagged-items.json` 파일 읽기
2. 각 항목을 **법령·2026년 개정·판례 기준으로 재검증**
3. 검증 통과 항목을 `functions/api/chat.js` 시스템 프롬프트의 적절한 섹션에 하드코딩
   - 섹션 형식: `===== 제목 =====` 유지
   - 기존 비슷한 섹션 있으면 그 아래에 추가
4. 검증 실패/애매한 항목은 사용자에게 보고 + 제외
5. 처리 결과 요약 보고 (반영 N건 / 제외 N건 / 사유)
6. 처리 완료 항목은 `flagged-items.json`에서 제거 또는 `processed: true` 마킹

### `flagged-items.json` 실제 포맷 (관리자 → GitHub 동기화 방식)
`admin-sync-to-github` API가 **검증 대기중인 실제 답변들**을 GitHub에 올리는 파일. 필드:
```json
{
  "exported_at": "...",
  "total": N,
  "items": [
    {
      "id": 136,
      "created_at": "...",
      "user_name": "...",
      "confidence": "보통",
      "reported": true,
      "question": "사용자가 실제로 물어본 질문",
      "answer": "AI가 답변한 내용 (검증 대상)"
    }
  ]
}
```

**처리 후**: `/api/admin-review` 엔드포인트로 각 id를 `mark_reviewed` 또는 `report_and_review` 처리.

## 🚨 자동 검증 시스템 (세션 바뀌어도 절대 까먹지 말 것)

이 프로젝트는 **AI 답변 자동 검증 파이프라인**이 구축되어 있음. 흐름:

```
1. 사용자 질문 → chat.js (GPT 답변 생성)
2. chat.js가 답변 끝에 [신뢰도: 높음/보통/낮음] 자동 태깅
3. 할루시네이션 의심 패턴 자동 감지 → DB에 reported=1 마킹
4. admin.html "검증" 탭에서 신뢰도 낮은/신고된 답변 확인
5. admin → "🚀 Claude 호출" 버튼 → /api/admin-sync-to-github → 
   검증 대상들이 flagged-items.json으로 GitHub에 올라감
6. 사용자가 Claude한테 "flagged-items.json 처리해줘" 말함
7. Claude(나)가 파일 읽고 → 법령 재검증 → _faq.js에 Q번호 신규 추가 또는 수정
8. 처리 끝난 항목은 /api/admin-review (action: mark_reviewed/report_and_review)로 클린업
```

### 관련 파일/엔드포인트
- `functions/api/_faq.js` — FAQ 하드코딩 본체 (현재 Q1~Q70 + Q35-2 총 71개)
- `functions/api/admin-review.js` — 검증 대기 목록 조회 + 처리완료 마킹
- `functions/api/admin-sync-to-github.js` — 검증 대상을 flagged-items.json으로 GitHub 푸시
- `functions/api/admin-migrate-confidence.js` — 기존 답변 소급 신뢰도 분류
- `functions/api/admin-dashboard.js` — 대시보드
- `flagged-items.json` — 검증 대상 데이터 (자동생성, 수동편집 금지)

### ⭐ `flagged-faqs.json` 처리 절차 (RAG FAQ 재검토)
사용자가 **"flagged-faqs.json 처리해줘"** 라고 하면:

1. 저장소 루트의 `flagged-faqs.json` 파일 읽기
2. 각 item(의심·틀림 FAQ)에 대해:
   - 국가법령정보센터 API(`/api/law` 또는 WebFetch)로 법조문 재확인
   - status='wrong' 이면: 올바른 내용으로 answer·law_refs 교체
   - status='suspicious' 이면: 민감 숫자·시점 최신 고시 기준 확정
3. 수정된 각 FAQ에 대해 `/api/admin-faq?action=update` 호출 (D1 업데이트 + 자동 재임베딩)
4. 재검증 통과한 FAQ는 `/api/admin-faq?action=set_verified` 로 status='verified'로 변경
5. 처리 결과 보고: 수정 N건 / 삭제 M건 / 변경 없음 K건
6. 처리 완료 후 `flagged-faqs.json` 삭제 또는 processed: true 마킹

**관련 엔드포인트**:
- `functions/api/admin-faq.js` — FAQ CRUD (update 시 자동 재임베딩, set_verified)
- `functions/api/admin-faq-sync-to-github.js` — 의심·틀림 FAQ를 flagged-faqs.json으로 푸시
- `functions/api/_faq-verify-report.js` — Claude 검증 리포트 (q_number → status/note)
- `functions/api/admin-faq-verify-apply.js` — 리포트를 faqs 테이블에 일괄 적용
- `functions/api/_faq-seed-batch-1.js` — 배치 1 시드 (50개 FAQ)
- `functions/api/admin-faq-seed.js` — 배치 로딩

### ⭐ Claude가 "flagged-items.json 처리해줘" 받으면 무조건 실행
1. `flagged-items.json` 읽기 (로컬 우선 → 없으면 `git pull`로 당기기)
2. 각 item의 `question` + `answer` 검토:
   - 답변 틀렸으면 → `_faq.js`에 올바른 Q 항목 신규 추가(다음 번호) 또는 기존 Q 수정
   - 답변 맞으면 → FAQ 추가 없이 mark_reviewed만
3. `_faq.js` 수정 시 형식 준수: `[Q{N}. 제목]\n내용\n근거: 법령` + `FAQ_SECTION` export 유지
4. 사용자에게 "신규 FAQ N개 추가 / 기존 Q{N} 수정 / mark_reviewed만 M건" 형태로 보고
5. 승인받으면 커밋 + 푸시

### FAQ 추가 원칙 (_faq.js)
- Q번호는 마지막 번호 다음부터 연속
- 답변 끝에 **근거: 법령명 제N조** 반드시 포함
- 2026년 기준 수치 (국세청 최신 고시 확인)
- 모르면 "확인이 필요합니다" — 추측 금지

### 🔐 보안 절대 규칙 (2026-04-21 강화)
**절대 하지 말 것**:
- ❌ 주민등록번호·카드번호·홈택스 비번 등 민감정보를 **localStorage/sessionStorage/cookie/IndexedDB**에 저장
- ❌ base64 인코딩을 "암호화"로 취급 (실제 AES-GCM + KMS 없으면 저장 자체를 거부)
- ❌ ADMIN_KEY·세션 토큰을 로그·에러 응답·URL 파라미터로 노출
- ❌ OAuth/API 에러 응답에 `e.message`, `client_id`, `redirect_uri`, 스택 트레이스 반환 (항상 중립 메시지)
- ❌ 사용자 제공 URL(image_url/file_url/endpoint 등)을 검증 없이 DB에 저장
- ❌ 프론트 권한 숨김만으로 끝내고 서버 검증 누락
- ❌ `e()` 같은 text-only escape를 **속성 문맥**(`value="${}"`)에 사용 (반드시 `escAttr` 사용)

**필수**:
- ✅ 모든 변경·조회 API는 서버에서 세션 또는 ADMIN_KEY 검증 + 소유권/멤버십 확인
- ✅ 업로드 파일은 MIME+확장자 화이트리스트, 크기 상한, 경로 구분자·제어문자 제거
- ✅ R2 키는 `crypto.randomUUID()` 기반 CSPRNG (Math.random 금지)
- ✅ `/api/image`, `/api/file` 프록시는 세션 또는 ADMIN_KEY 요구
- ✅ 민감 컬럼(주민번호 등)은 DB에 마스킹 저장 (앞 6자리만, 뒤 전체 `*`)
- ✅ `_headers`에 CSP, X-Frame-Options DENY, HSTS, Referrer-Policy 전역 적용

### 🚨 Cloudflare 대시보드 설정 절대 건드리지 말 것 (절대 규칙)
**사용자가 2026-04-17 강력 지시. 과거 D1 바인딩 날아간 사고 있음.**
- ❌ `wrangler.toml` 생성/수정 금지 (D1 바인딩 override 참사)
- ❌ `_routes.json`, `_headers` 등 인프라 설정 파일 손대지 말 것 (기존 유지만)
- ❌ 바인딩(R2 / D1 / KV)·환경변수를 코드로 우회/override 시도 금지
- ✅ 코드는 `context.env.DB`, `context.env.MEDIA_BUCKET` 사용만
- ✅ 바인딩·환경변수는 사용자가 직접 대시보드에서 관리
- 바인딩 문제 발생 시 = 사용자에게 대시보드 조작 **안내만** 하고 코드 우회 X
- 꼭 필요하면 사전 명시 승인 필요

### 🚨 UI 박살 방지 (절대 규칙, 2026-04-21 추가)
**"뭐 수정했을 때 UI 박살나면 안 된다."** 코드 로직만 고치다가 스타일·레이아웃이 망가져 사용자가 고생한 사고 반복됨. 아래 체크 없이 UI 관련 수정 금지.

#### 수정 전 필수 체크
1. **엘리먼트 태그 교체 시** (`<input>`→`<textarea>`, `<button>`→`<a>` 등):
   - 관련 CSS 셀렉터를 `grep`으로 전부 확인 (`.wrap input{}`, `#id`, `tag{}`)
   - **태그 기반 셀렉터**는 교체 후 무효화됨 → `.wrap input, .wrap textarea {}` 처럼 **selector grouping** 으로 확장
2. **헤더/툴바에 버튼 추가 시**:
   - 타이틀 영역에 `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` 있는지 확인 없으면 먼저 추가
   - 부모 `flex-wrap` 요소는 `flex:1; min-width:0; overflow:hidden` 세 개 모두 있어야 안전
   - 모바일(360-400px) 기준 버튼 총 너비가 헤더를 넘기지 않는지
3. **CSS 기본값 차이 주의**:
   - `<input>` vs `<textarea>`: 기본 `line-height`·`rows`·`resize handle` 다름 → `resize:none; line-height:1.4` 명시
   - `<a>` vs `<button>`: `<a>`는 기본 `display:inline` → 필요 시 `display:inline-flex`
4. **캐시 버스팅 잊지 말기**: `admin.js`·CSS 수정하면 `<script src="/admin.js?v=NN">`의 v 번호 +1

#### 과거 사고 기록 (반복 금지)
- 2026-04-21: input→textarea 교체 시 `.input-bar input{}`·`.rc-input-area input{}` 셀렉터가 input 전용이라 textarea 찌그러짐 → 복구 커밋 `dfafdab`
- 2026-04-21: 헤더에 📞 버튼 추가했더니 `#rcTitle`에 nowrap/ellipsis 없어 모바일에서 한글이 세로로 한 글자씩 접힘 → 복구 커밋 `3e48f65`

#### 수정 후 필수 확인
- 입력창 폭·높이 정상인지 (모바일·PC)
- 헤더 타이틀 말줄임 정상 동작인지 (좁은 폭에서 "세무회계 이윤 이재윤대표" 같은 긴 이름)
- 기존 기능 회귀 없는지 (보낸 메시지 렌더·스크롤·탭 전환)

### ⚠️ 검증 정확성 최우선 원칙 (절대 규칙)
**속도보다 정확성이 항상 우선.** 사용자(세무사)가 "천천히 해도 되니 정확히 하라"고 명시함.
- FAQ 작성 전 반드시 **법조문 원문 확인** (법률 + 시행령 + 시행규칙)
- 추측 금지. 애매하면 "확인 필요"로 두거나 FAQ 제외
- 비슷해 보이는 조문 혼동 주의 (예: 조특법 제31조 통합 ≠ 제32조 법인전환)
- 2026년 기준 금액·세율은 국세청 최신 고시로 재확인
- 작성 후 스스로 재검증 1회 추가
- **과거 실수 사례 기억**: Q82(수도 면세/과세 혼동), Q83(중소기업 요건·주식 100% 요건 오류)
- 사용자가 재촉해도 정확성 타협 금지. "시간 걸려도 정확히 하겠다"고 밝히고 진행

## 아키텍처 요약
- **프런트**: `index.html`(챗), `admin.html`(관리자), `articles.html`(칼럼), `sw.js`(PWA)
- **API**: `functions/api/chat.js`(843줄, 핵심 로직 + 시스템 프롬프트), `functions/api/auth/*`(카톡/네이버 로그인), `functions/api/admin-users.js`(승인관리)
- **DB**: D1 SQLite — `users`(승인상태/본명), `sessions`, `conversations`, `daily_usage`
- **콘텐츠**: `articles/` 세무 칼럼 29편

## 주요 규칙 (chat.js 프롬프트에 박혀있음)
- 수수료/기장료 금액 절대 언급 금지
- 다른 세무사 추천 금지
- 볼드체(**) 금지, 따옴표("")나 대괄호([])로 강조
- 모르면 "확인이 필요합니다" — 할루시네이션 차단 최우선
- 숫자는 프롬프트 하드코딩 수치 또는 법령 조문 수치만 사용

## 승인 시스템
- `pending`: 일 3건 / `approved_guest`: 일 10건 / `approved_client`(기장거래처): 일 30건 / `rejected`: 0건
- 본명 확인 필수 (카톡 닉네임이 가명인 경우 많음)

## 배포
- Cloudflare Pages 자동배포 (main 푸시 시)
- 환경변수: `OPENAI_API_KEY`, `LAW_API_OC`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `ADMIN_KEY`, `DB`(D1 바인딩)
