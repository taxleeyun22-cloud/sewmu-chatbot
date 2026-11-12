# 세무회계 이윤 AI 세무 챗봇 — Claude 작업 규약 (root)

대구 달서구 세무회계 이윤 (대표세무사 이재윤) 의 AI 세무 상담 챗봇.
**Cloudflare Pages + D1 + R2 + KV + OpenAI GPT-4.1-mini + 국가법령정보센터 API.**

## 사용자 정보
- 대표세무사 (기장 거래처 150+ 보유)
- 상용화 진행 중

## 영역별 룰 (각 영역의 CLAUDE.md 참조)

| 영역 | 룰 |
|---|---|
| **apps/admin** | `apps/admin/CLAUDE.md` — admin UI / 디자인 토큰 / UI 박살 방지 / mutation done / 에러 로그 / Tailwind / TypeScript / React |
| **apps/customer-web** | `apps/customer-web/CLAUDE.md` — 거래처 챗봇 / 승인 시스템 |
| **packages/api** | `packages/api/CLAUDE.md` — tRPC / audit / RBAC 적용 |
| **packages/db** | `packages/db/CLAUDE.md` — Drizzle schema / D1 / lazy migration |
| **packages/auth** | `packages/auth/CLAUDE.md` — Auth.js / RBAC catalog / 보안 |
| **packages/ai** | `packages/ai/CLAUDE.md` — FAQ / RAG / chat.js / flagged-items / 거래처 PDF |

작업 시작 전 해당 영역의 CLAUDE.md 도 같이 읽기 (Claude Code 가 hierarchical 자동 로드).

---

## 🧭 세션 시작 루틴 (절대 규칙, 2026-04-24)

**과거 사고**: 오래된 브랜치에서 재설계 v2 작업하다가 main 에 이미 반영된 기능 (위하고 필드·N:N 매핑·승인 분기·챗봇 무제한·의심검토 제거) 을 모르고 중복 구현. merge 시도하다 회귀 유발 직전 발견.

**반복 금지. 세션 시작 시 아래 체크 없이 작업 금지:**

1. **3줄 상태 점검** (세션 시작 즉시):
   - `git branch --show-current` — 현재 브랜치명
   - `git log --oneline main..HEAD | head` — 내 브랜치에만 있는 커밋
   - `git log --oneline HEAD..main | head` — main 에만 있는 커밋
2. **브랜치가 main 보다 5+ 커밋 뒤처진 경우** 작업 시작 전 사용자에게 보고:
   > "이 브랜치 main 보다 N 커밋 뒤처져 있어요. rebase/reset 할지 결정 부탁드립니다."
3. **신규 기능 제안 전 main 중복 확인**: 테이블명·엔드포인트명·키워드로 `grep` 3~4회. 이미 있으면 "중복 구현 금지" — 재사용·확장만 제안.
4. **사용자가 실행 요청하기 전** 반드시 3줄 요약 보고: ① 현재 branch 상태 ② 이미 있는 인접 기능 ③ 이번에 손댈 파일 목록.

---

## 🚫 사용자 권한·Status 자동 변경 금지 (2026-05-08)

**과거 사고**: Claude (나) 가 이재윤·채승용 admin 권한 자동으로 set_admin=1 SET 3번 반복. **진짜 원인**: 사장님이 의도적으로 admin 권한 X (기장거래처 카테고리로 옮김) 했는데, Claude 가 admin counts=2 보고 "reset 됐다 → 복구해야" 잘못 해석.

**룰**:
- 사용자 권한 (`is_admin`, `staff_role`) 및 status (`approval_status`) 변경은 **사장님이 직접 admin UI 에서 관리**
- Claude 가 자동으로 set_admin / approval_status / staff_role 변경 **절대 금지**
- 사장님 명시 명령 받을 때만 실행: "이재윤 admin 으로 만들어줘" / "박승호 기장거래처 승급해줘" 등
- "admin counts 줄어들면 reset" / "관리자 4명이 정상" 같은 자동 가정 X
- `set_admin auto-status` 같은 자동 흐름 (대기 → 관리자 승급 시 status='approved_client' 자동) 은 사장님이 명시 명령한 경우만 유지. 그 외 cascading SET 금지.

**예외**: 사장님이 직접 클릭한 흐름 / 명시 명령한 외부 호출 OK.

**위반 시**: 사장님 결정 무시 + 데이터 인위 변경. 사장님 짜증·신뢰 ↓.

---

## 🚨 Cloudflare 대시보드 금지 (절대 규칙)

**사용자 2026-04-17 강력 지시. 과거 D1 binding 날아간 사고 있음.**

- ❌ `wrangler.toml` 생성/수정 금지 (D1 binding override 참사)
- ❌ `_routes.json`, `_headers` 등 인프라 설정 파일 손대지 말 것 (기존 유지만)
- ❌ 바인딩 (R2 / D1 / KV) · 환경변수를 코드로 우회/override 시도 금지
- ✅ 코드는 `context.env.DB`, `context.env.MEDIA_BUCKET` 사용만
- ✅ 바인딩·환경변수는 사용자가 직접 대시보드에서 관리
- 바인딩 문제 발생 시 = 사용자에게 대시보드 조작 **안내만**, 코드 우회 X
- 꼭 필요하면 사전 명시 승인 필요

---

## ⚠️ 검증 정확성 최우선 (절대 규칙)

**속도보다 정확성이 항상 우선.** 사용자(세무사) 명시: "천천히 해도 되니 정확히".

- FAQ 작성 전 반드시 **법조문 원문 확인** (법률 + 시행령 + 시행규칙)
- 추측 금지. 애매하면 "확인 필요" 로 두거나 FAQ 제외
- 비슷해 보이는 조문 혼동 주의
- 2026년 기준 금액·세율은 국세청 최신 고시로 재확인
- 작성 후 스스로 재검증 1회 추가
- 사용자가 재촉해도 정확성 타협 금지

세부: `packages/ai/CLAUDE.md`

---

## Claude 가 직접 검증

변경 후 사장님께 "확인 부탁" 던지지 말고 **Playwright MCP / curl / WebFetch 등으로 prod 직접 들어가 검증·보고**.

prod URLs:
- 옛 admin: https://sewmu-chatbot.pages.dev/admin.html
- 새 admin (동결 — 청구서·영업타겟 전용): https://sewmu-admin.pages.dev/admin/billing , /admin/sales-targets
- 옛 거래처 챗봇: https://sewmu-chatbot.pages.dev/index.html

---

## 아키텍처 요약

### prod 매일 작동 중 (옛)
- `index.html` (거래처 챗봇), `admin.html` (관리자), `articles.html` (칼럼), `sw.js` (PWA)
- `functions/api/chat.js` (843줄, GPT 시스템 프롬프트 + 신뢰도 분류)
- `functions/api/admin-*.js` (77개 endpoints)
- D1 SQLite + R2 + KV

### 새 admin (Next.js) — ⛔ 동결 (2026-11-11 사장님 "Next.js 는 그냥 두고 기존 언어로 계속, 지금 너무 분답다")
- **새 기능·수정은 옛 admin(root: `admin.html`, `admin-*.js`, `modals/`, `functions/api/`) 에만.**
- `apps/admin/` 은 손대지 않는다: 새 페이지 X, 새 `app/api/[name]/route.ts` wrapper X, 미러 복사 X.
  (pre-commit·빌드의 `sync-mirror` / `sync-assets` 는 2026-11-11 에 뺐다 — 다시 넣으려면 사장님 확인)
- 남겨 둔 이유: **청구서(`/admin/billing*`)·영업타겟(`/admin/sales-targets`)** 은 아직 새 admin 에만 있다 (사장님 사용 중).
  옛 admin 메뉴에서 새 탭으로 열린다. 청구서는 tRPC(`packages/api`) 로 살아 있는 코드를 쓴다.
- `apps/admin/public`, `apps/admin/functions/api` = 2026-11-11 시점 스냅샷 (지우지 말 것 — 위 두 화면이 쓴다).
  - 옛 `functions/api/sales-pipeline.js` 의 sales_leads 구조를 바꾸면 영업타겟이 어긋날 수 있다 →
    그때만 그 한 파일을 `apps/admin/functions/api/` 로 같이 복사.
- 알려진 잠재 문제 (고치지 않음, 기록만): 로그인 쿠키 서명 키가 옛(ADMIN_KEY)·새(AUTH_SECRET) 다름 /
  청구서 링크에 ADMIN_KEY 가 URL 로 붙음 (`admin-customer-dash.js`, `business.js` 의 billing/new 링크).

### 공용 패키지 (packages/*)
- `packages/api` — tRPC (새 admin 청구서·영업타겟 전용)
- `packages/db` — Drizzle 스키마 + 테스트 DB(`src/test-db.ts`, 옛 functions 테스트도 씀)
- `packages/auth` — RBAC catalog (`rbac.ts` → 빌드 때 옛 admin `permissions.json` 생성 — 옛 admin 도 씀)
- `packages/ai` — FAQ / RAG / chat 로직
- `packages/types` / `packages/ui` — 공통

---

## 배포

- Cloudflare Pages 자동 배포 (main 푸시 시)
- 두 prod project:
  - `sewmu-chatbot` (옛, root functions/) — 거래처 챗봇 + 옛 admin
  - `sewmu-admin` (새, apps/admin/) — ⛔ 동결 스냅샷. 청구서·영업타겟 전용
- 환경변수 (양쪽 동일): `OPENAI_API_KEY`, `LAW_API_OC`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `ADMIN_KEY`, `AUTH_SECRET`
- 바인딩 (양쪽 동일): `DB` (D1), `MEDIA_BUCKET` (R2), `KV` (있다면)

---

## chat.js 시스템 프롬프트 룰 (세부: `packages/ai/CLAUDE.md`)
- 수수료/기장료 금액 절대 언급 금지
- 다른 세무사 추천 금지
- 볼드체 (**) 금지, 따옴표 ("") 나 대괄호 ([]) 로 강조
- 모르면 "확인이 필요합니다" — 할루시네이션 차단 최우선
- 숫자는 프롬프트 하드코딩 또는 법령 조문 수치만

## 승인 시스템 (세부: `apps/customer-web/CLAUDE.md`)
- 비회원: 사용 불가
- pending: 일 5건 (2026-05-02 인상)
- approved_guest: DEPRECATED
- approved_client (기장거래처): 무제한
- rejected: 0건
