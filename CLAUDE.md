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

### `flagged-items.json` 포맷
```json
{
  "items": [
    {
      "id": 1,
      "topic": "간이과세자 전환",
      "question": "간이과세자 기준이 언제 바뀌었나요?",
      "proposed_answer": "2024년 7월부터 연매출 8,000만원 → 1억400만원으로 상향",
      "source_hint": "부가세법 제61조, 시행령 제109조",
      "section": "2026년 세무 개정사항",
      "processed": false
    }
  ]
}
```

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
