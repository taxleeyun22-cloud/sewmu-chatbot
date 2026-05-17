# apps/admin — Claude 작업 규약 (admin UI 영역)

세무회계 이윤 admin 사이트. `sewmu-admin.pages.dev` 진입.
**현재 모드**: 옛 admin.html / admin-*.js / functions/api/*.js 를 Next.js wrapper 로 import (2026-05-11 cutover).

## 🔁 미러 자동화 (A-3, 2026-05-17 — 수동 cp 폐지)
**`apps/admin/public/` 은 repo-root 정적 자산의 자동 미러.** 직접 편집·수동 `cp` 금지.
- 정본 = repo root 의 `admin*.js` / `*.html` / `admin.css` 등 (31개, `scripts/sync-mirror.mjs` FILES 목록)
- pre-commit hook 이 `node scripts/sync-mirror.mjs` 실행 → 변경분 자동 stage → drift 영구 차단
- apps/admin `prebuild` 도 동일 실행 (CI 빌드 안전망)
- 환경별 분기 필요 시 **root 에 통합** (예: admin.css P0 모달 fix 를 root 로 포팅함). 역방향(미러→root) 금지.
- 새 정적 파일 추가 시 `scripts/sync-mirror.mjs` 의 `FILES` 에 1줄 추가.

## 영역
- `public/` — 옛 admin.html / admin-*.js / admin.css / admin-modals.html 통째 (정적 자산, root 자동 미러)
- `functions/api/` — 옛 Cloudflare Pages Functions 80개 (그대로 import)
- `app/admin/` — 새 Next.js admin pages 18개 (archive, `/admin/*` 진입 시)
- `app/api/[name]/route.ts` — Next.js wrapper (옛 functions/api/*.js 호출)
- `components/` — React 컴포넌트
- `lib/cf-context.ts` — Cloudflare context bridge (callLegacy)
- `middleware.ts` — 3중 인증 (admin_key_auth / admin_key / Auth.js session)

## 진입 흐름

```
/  → redirect /admin.html (옛 admin UI)
/admin.html → 옛 admin.js 작동
/api/admin-* → Next.js wrapper → callLegacy(onRequestGet, request) → 옛 *.js 실행
```

## 🔗 관리자 ↔ 스태프 동기화 (Phase M5 2026-05-05 폐지)
**Phase M5**: staff.html → admin.html redirect 으로 폐기.
- staff.html = 단순 redirect 페이지 (~30줄)
- admin.js / admin-modals.html 등 cache bump 시 staff.html bump **불필요**
- 별도 staff 권한 분기 필요 시 admin.html 안에서 IS_OWNER / auth.role 체크 (이미 구현)

## 🔄 Mutation 후 UI 갱신 절대 룰 (2026-05-08)

**과거 사고**: 9건 발견 (업체 삭제 후 list 안 사라짐 / 사용자 status 변경 후 사이드바 카운트 옛값 / 메모 삭제 후 휴지통 배지 안 갱신 / 단체발송 후 상담방 last_message 옛값 / etc).

**룰** (모든 admin UI mutation 함수 작성 시 강제):

```js
const r = await fetch(...);
const d = await r.json();
if (d.ok) {
  if (typeof mutationDone === 'function') {
    mutationDone({
      users: true,        // 사용자 list 갱신 필요?
      businesses: false,  // 업체 list 갱신 필요?
      rooms: false,       // 상담방 list 갱신 필요?
      memos: false,       // 거래처 dashboard 메모 갱신 필요?
      // sidebar: true (default)
    });
  }
}
```

**핵심**:
1. fetch (POST/PUT/DELETE) 호출 후 → **무조건 mutationDone()**
2. 영향받는 영역만 옵션 (users / businesses / rooms / memos)
3. sidebar 카운트 default true
4. 30초 polling 의존 X — 즉시 갱신
5. cross-page 변경은 `localStorage.setItem('_bizListDirty', String(Date.now()))` → admin focus/pageshow 시 자동 reload

**구현**:
- `admin.js` 의 `mutationDone(opts)` — 공통 헬퍼
- admin.js 의 `_checkCrossPageDirty()` — focus/pageshow/storage listener

## 🐞 에러 로그 — 옵션 A 룰 (2026-05-06)

자체 에러 로거 (`/api/admin-error-log` + 사이드바 🐞 무당벌레) 자동 작동.

**룰**:
- Claude (나) 는 **자동 분석 X**. 사장님 명령 받을 때만 분석.
- 사장님이 "에러 봐봐" / "무당벌레 분석" / "거래처 사고 봐봐" 명령 시:
  1. ADMIN_KEY 또는 모달 캡처·텍스트 받기
  2. D1 error_logs 패턴 분석
  3. 원인 + 고침 commit
- 평소 = 사장님 무시 가능. "🗑️ 7일 지난 거" 또는 "🗑️ 전체 비우기 (owner)" 클릭.
- **prod 검증 시 절대 source = 'verify' / 'test' 등으로 POST 금지** (사장님 사이드바에 가짜 빨간 점)

## 🚨 UI 박살 방지 (절대 규칙, 2026-04-21)
**"뭐 수정했을 때 UI 박살나면 안 된다."**

### 수정 전 필수 체크
1. **엘리먼트 태그 교체 시** (`<input>`→`<textarea>` 등):
   - 관련 CSS 셀렉터 `grep` 으로 전부 확인
   - **태그 기반 셀렉터**는 교체 후 무효화됨 → selector grouping 으로 확장
2. **헤더/툴바에 버튼 추가 시**:
   - 타이틀 영역에 `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` 확인
   - 부모 flex-wrap 요소는 `flex:1; min-width:0; overflow:hidden` 세 개 모두
   - 모바일(360-400px) 기준 버튼 총 너비 체크
3. **CSS 기본값 차이 주의**:
   - `<input>` vs `<textarea>`: `resize:none; line-height:1.4` 명시
   - `<a>` vs `<button>`: `<a>` 는 `display:inline` 기본 → 필요 시 `display:inline-flex`
4. **캐시 버스팅**: `admin.js`·CSS 수정하면 `<script src="/admin.js?v=NN">` v 번호 +1

### 과거 사고 기록 (반복 금지)
- 2026-04-21: input→textarea 교체 시 셀렉터 input 전용이라 textarea 찌그러짐 → 복구 `dfafdab`
- 2026-04-21: 헤더 📞 버튼 추가했더니 `#rcTitle` nowrap 없어 한글 세로로 한 글자씩 접힘 → 복구 `3e48f65`

### 수정 후 필수 확인
- 입력창 폭·높이 정상 (모바일·PC)
- 헤더 타이틀 말줄임 정상
- 기존 기능 회귀 0

## ⚛️ React 18/19 도입 (Phase 1 인프라 · 2026-05-07)

**메타 12종 #2**:
- react@19 / react-dom@19
- @vitejs/plugin-react / @testing-library/react

빌드 entry (vite.config.ts):
- main: src/main.ts
- react: src/react/main.tsx → dist/assets/react.js

**룰**:
- ✅ 신규 admin 시각 컴포넌트는 React (.tsx)
- ✅ 타입 안전 + 단위 테스트 (RTL)
- ⚠️ admin.html / admin-modals.html 본체 inline 마크업은 그대로 — 점진 마이그레이션
- ⚠️ React mount 패턴: `<div id="admin-role-badge-inline"></div>` + `<script type="module" src="/assets/react.js"></script>`

## 📦 TypeScript 5단계 변환 (2026-05-06)

**메타 12종 #3** — admin.js 점진 .ts 변환:
- Phase 1: admin.js 상단 // @ts-check + admin-globals.d.ts + JSDoc
- Phase 2: error-log.ts / sidebar-counts.ts / tabs.ts
- Phase 3: memos-room.ts / auth.ts / role-ui.ts
- Phase 4: router-hooks.ts / lazy-loaders.ts

**룰**:
- ✅ 신규 헬퍼 함수는 src/admin/*.ts (strict + tests)
- ✅ 타입 정의는 src/types/admin-globals.d.ts
- ✅ admin.js 안 직접 함수 추가 시 JSDoc + // @ts-check
- ⚠️ admin.js 본체 통째 .ts 변환은 별도 phase (4500줄, 1-2주)

## 🧬 B: classic script → ESM 전환 (Phase B-1 · 2026-05-17)

**사장님 결정 "점진 (인프라+leaf 1개부터)"** — strangler 패턴. live admin 무파괴 최우선.

진행:
- B-1 ✅ `paste-drop.js` → `src/lib/paste-drop.ts` (leaf 1개, 6 tests, Playwright PASS)
- B-2+ ⏳ 다음 leaf — **사장님 확인(checkpoint) 받고 1개씩** (big-bang 금지)

**룰** (classic → ESM 전환 시 반드시):
- ✅ leaf 우선: 의존 적은 모듈부터 (남이 import 안 하는 것 → window.* 만 노출하던 것)
- ✅ `src/lib/<name>.ts` (strict TS) + `src/lib/<name>.test.ts` (Vitest, happy-dom)
- ✅ **classic 호환 bridge 필수**: 모듈이 `window.<fn> = <fn>` self-register
  → classic 소비자(admin-*.js 등) 무수정 그대로 작동. 소비자가 ESM import 로
  전환 완료되면 그때 bridge 제거.
- ✅ `src/main.ts` 에서 `import './lib/<name>'` (main 번들 흡수)
  → admin/business/memo-window.html 모두 `<script type=module src=assets/main.js>` 로드
- ✅ classic 파일 `git rm` + `vite.config.ts` viteStaticCopy + `scripts/sync-mirror.mjs`
  FILES + `.husky/pre-commit` git add 목록에서 동시 제거 (4곳 누락 시 빌드/미러 깨짐)
- ✅ 전환하며 발견한 잠재버그 동시 fix OK (B-1: dragover outline 문자열비교 → 불리언)
- ✅ 각 leaf push 후 Playwright prod 회귀검증 (window.<fn> 'function' + 소비자 + 콘솔 401만)
- ⚠️ admin.js/index.js 등 강결합 monolith(전역심볼 68~151)는 leaf 아님 — 후순위

## 🎨 Tailwind 활성화 (Phase T1 · 2026-05-04)

**메타 12종 #5**:
- 모든 HTML 에 `<link rel="stylesheet" href="/assets/main.css?v=N">`
- `tailwind.config.ts` 30개 토큰 → utility class 자동 (`bg-of-primary`, `text-sb-text` 등)
- `src/styles/globals.css` = 토큰 단일 진실

**룰**:
- ✅ Tailwind utility class 우선: `bg-of-primary text-white p-4 rounded-of-md`
- ✅ 색은 토큰 utility: `bg-of-primary` (NOT `bg-blue-500`)
- ⚠️ 인라인 style 지양 (Phase T3 변환 예정)
- ⚠️ raw CSS 도 점진 마이그레이션 (Phase T2)

## 🎨 디자인 토큰

`admin.html` `:root` CSS 변수:
- 모달 overlay: `var(--overlay-bg)` = `rgba(0,0,0,.5)`
- Radius: `--radius-sm` 6px / `--radius-md` 8px / `--radius-lg` 12px / `--radius-xl` 16px
- 브랜드 색:
  - `--brand-primary` #3182f6 — 확인·저장·일반 액션
  - `--brand-danger` #dc2626 — 삭제·취소·위험
  - `--brand-warn` #fbbf24 — 경고·고객 공개
  - `--brand-success` #10b981 — 완료·성공
  - `--brand-kakao` #FEE500 — 카톡 말풍선
- 중성: `--neutral-bg / --neutral-border / --neutral-card`
- 텍스트: `--text-main / --text-sub / --text-mute`
- D-day 상태: `--status-overdue / today / tomorrow / week / later / none`

**원칙**:
- 새 버튼·카드·모달은 토큰 사용 (`background: var(--brand-primary)`)
- 기존 inline style 은 눈에 띄는 불일치만 교체
- 토큰 값 바꿀 일 = `:root` 한 곳만
