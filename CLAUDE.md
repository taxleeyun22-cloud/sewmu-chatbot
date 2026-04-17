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
