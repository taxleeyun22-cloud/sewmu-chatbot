# packages/ai — Claude 작업 규약 (FAQ / RAG / chat / 검증)

세무 챗봇 AI 영역. OpenAI GPT-4.1-mini + 국가법령정보센터 API + RAG 임베딩 + 자동 검증 파이프라인.

## 영역
- `src/system-prompt.ts` — chat.js 시스템 프롬프트 본체 (843줄)
- `src/openai.ts` — OpenAI API client
- `src/rag.ts` — FAQ 임베딩 검색
- `src/kakao-alimtalk.ts` — 카카오 비즈 알림톡
- `src/filing-pdf.ts` — 세무조정계산서 PDF 분석
- `src/r2-key.ts` — R2 키 생성 (CSPRNG)

## FAQ/지식 추가는 Claude가 주도
1. Claude가 추가할 FAQ 항목 **먼저 제안**
2. Claude가 법령·실무 기준으로 **스스로 검증**
3. 사용자 OK 후 `functions/api/chat.js` 시스템 프롬프트에 하드코딩

## ⚠️ 검증 정확성 최우선 (절대 규칙)

**속도보다 정확성이 항상 우선.** 사용자(세무사) 명시: "천천히 해도 되니 정확히".

- FAQ 작성 전 반드시 **법조문 원문 확인** (법률 + 시행령 + 시행규칙)
- 추측 금지. 애매하면 "확인 필요"로 두거나 FAQ 제외
- 비슷해 보이는 조문 혼동 주의 (예: 조특법 제31조 통합 ≠ 제32조 법인전환)
- 2026년 기준 금액·세율은 국세청 최신 고시로 재확인
- 작성 후 스스로 재검증 1회 추가
- **과거 실수 사례 기억**: Q82(수도 면세/과세 혼동), Q83(중소기업 요건·주식 100% 요건 오류)
- 사용자가 재촉해도 정확성 타협 금지

## FAQ 추가 원칙 (_faq.js)
- Q번호는 마지막 번호 다음부터 연속
- 답변 끝에 **근거: 법령명 제N조** 반드시 포함
- 2026년 기준 수치 (국세청 최신 고시)
- 모르면 "확인이 필요합니다" — 추측 금지

## chat.js 시스템 프롬프트 룰
- 수수료/기장료 금액 절대 언급 금지
- 다른 세무사 추천 금지
- 볼드체(**) 금지, 따옴표("")나 대괄호([])로 강조
- 모르면 "확인이 필요합니다" — 할루시네이션 차단 최우선
- 숫자는 프롬프트 하드코딩 수치 또는 법령 조문 수치만 사용

---

## 🚨 자동 검증 시스템 (세션 바뀌어도 절대 까먹지 말 것)

**AI 답변 자동 검증 파이프라인**:

```
1. 사용자 질문 → chat.js (GPT 답변 생성)
2. chat.js 가 답변 끝에 [신뢰도: 높음/보통/낮음] 자동 태깅
3. 할루시네이션 의심 패턴 자동 감지 → DB에 reported=1 마킹
4. admin.html "검증" 탭 → 신뢰도 낮은/신고된 답변 확인
5. admin → "🚀 Claude 호출" → /api/admin-sync-to-github →
   검증 대상이 flagged-items.json 으로 GitHub 푸시
6. Claude 한테 "flagged-items.json 처리해줘" 명령
7. Claude → 파일 읽고 → 법령 재검증 → _faq.js 에 Q번호 신규/수정
8. 처리 끝나면 /api/admin-review (mark_reviewed / report_and_review) 로 클린업
```

### 관련 파일/엔드포인트
- `functions/api/_faq.js` — FAQ 하드코딩 본체 (현재 Q1~Q70 + Q35-2 총 71개)
- `functions/api/admin-review.js` — 검증 대기 list + 처리완료 마킹
- `functions/api/admin-sync-to-github.js` — 검증 대상 → flagged-items.json
- `functions/api/admin-migrate-confidence.js` — 기존 답변 소급 신뢰도
- `functions/api/admin-dashboard.js` — 대시보드
- `flagged-items.json` — 검증 대상 데이터 (자동 생성, 수동 편집 금지)

---

## ⭐ `flagged-items.json` 처리 절차

사용자가 **"flagged-items.json 처리해줘"** 라고 하면:

1. 저장소 루트의 `flagged-items.json` 읽기 (로컬 우선 → 없으면 `git pull`)
2. 각 item 의 `question` + `answer` 검토:
   - 답변 틀렸으면 → `_faq.js` 에 올바른 Q 항목 신규 추가(다음 번호) 또는 기존 Q 수정
   - 답변 맞으면 → FAQ 추가 없이 mark_reviewed 만
3. `_faq.js` 수정 시 형식: `[Q{N}. 제목]\n내용\n근거: 법령` + `FAQ_SECTION` export 유지
4. 사용자에게 "신규 FAQ N개 추가 / 기존 Q{N} 수정 / mark_reviewed 만 M건" 보고
5. 승인받으면 커밋 + 푸시

### flagged-items.json 실제 포맷
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
      "answer": "AI 가 답변한 내용 (검증 대상)"
    }
  ]
}
```

**처리 후**: `/api/admin-review` 로 각 id 를 `mark_reviewed` 또는 `report_and_review` 처리.

---

## ⭐ `flagged-faqs.json` 처리 절차 (RAG FAQ 재검토)

사용자가 **"flagged-faqs.json 처리해줘"** 라고 하면:

1. 저장소 루트의 `flagged-faqs.json` 읽기
2. 각 item (의심·틀림 FAQ) 에 대해:
   - 국가법령정보센터 API (`/api/law` 또는 WebFetch) 로 법조문 재확인
   - status='wrong' → 올바른 내용으로 answer·law_refs 교체
   - status='suspicious' → 민감 숫자·시점 최신 고시 기준 확정
3. 수정된 각 FAQ 에 대해 `/api/admin-faq?action=update` 호출 (D1 update + 자동 재임베딩)
4. 재검증 통과 → `/api/admin-faq?action=set_verified` 로 status='verified'
5. 처리 결과 보고: 수정 N건 / 삭제 M건 / 변경 없음 K건
6. 처리 완료 후 `flagged-faqs.json` 삭제 또는 processed: true

### 관련 엔드포인트
- `functions/api/admin-faq.js` — FAQ CRUD (update 시 자동 재임베딩, set_verified)
- `functions/api/admin-faq-sync-to-github.js` — 의심·틀림 FAQ → flagged-faqs.json
- `functions/api/_faq-verify-report.js` — Claude 검증 리포트 (q_number → status/note)
- `functions/api/admin-faq-verify-apply.js` — 리포트를 faqs 테이블에 일괄 적용
- `functions/api/_faq-seed-batch-1.js` — 배치 1 시드 (50개 FAQ)
- `functions/api/admin-faq-seed.js` — 배치 로딩

---

## 📄 `거래처 PDF 처리해줘 [거래처명/user_id]` 처리 절차

세무사님이 `finance_pdfs/{user_id}/` 폴더에 세무조정계산서·부가세 신고서 PDF 를 push 후 Claude 한테 요청 → Claude 처리 순서:

1. **거래처명·user_id 매핑**: 거래처명만 받았으면 D1 `users` 테이블 조회
2. **PDF 위치 확인**: `finance_pdfs/{user_id}/` 디렉터리 (`Glob`)
3. **텍스트 추출**: `pdftotext "<file>" -` (Bash)
4. **재무 항목 파싱**:
   - 세무조정계산서 → 매출(영업수익), 매입(매출원가+판관비), 과세표준, 산출세액
   - 부가세 신고서 → 매출세액, 매입세액, 납부세액, 사업기간(예 2026-1기)
   - 종소세 신고서 → 종합소득금액, 산출세액, 결정세액
5. **JSON 행 생성**: `{ user_id, period, period_type, revenue, cost, vat_payable, income_tax, taxable_income, payroll_total, source: 'pdf', source_file: 'xxx.pdf' }`
6. **DB 적재**: 사용자에게 미리보기 보여주고 승인받은 뒤 SQL migration 작성 → commit
   - 또는 `/api/admin-finance?action=bulk_import&key=ADMIN_KEY`
7. **결과 보고**: 추가 N건 / 갱신 M건 / 실패 K건 + 어느 PDF 에서 어느 기간 들어갔는지 표

**원칙**: OpenAI API 비용 0. PDF 분석은 Claude(나) 가 직접 텍스트 보고 추출.

### 관련 엔드포인트
- `functions/api/admin-finance.js` — `client_finance` 테이블 CRUD (GET, POST upsert/bulk_import/delete, GET ?action=summary)
