# Development Guide

세무회계 이윤 AI 챗봇 + admin 사무실 OS — 개발 가이드.
Phase 14 (2026-05-12) 작성 — 사장님 새 직원 onboarding / 향후 협업자 참고.

## 0. 한 줄 요약

- **거래처 챗봇**: `sewmu-chatbot.pages.dev` (옛 index.html + chat.js + admin.html)
- **새 admin**: `sewmu-admin.pages.dev` (apps/admin Next.js, 옛 admin.html 도 그대로 import)
- **D1 / R2 / KV** 같은 인스턴스 공유 — 사장님 카톡 = 양쪽에서 같은 user_id
- **2 prod 동시 운영** 중 — 옛 → 새 점진 이전 (drift 위험 큰 거 주의)

## 1. 빠른 시작 (5분)

### 필수 도구
```
Node 20+
npm 10+
git
```

### Clone + Install
```bash
git clone https://github.com/taxleeyun22-cloud/sewmu-chatbot.git
cd sewmu-chatbot
npm ci
```

### Develop
```bash
# 거래처 챗봇 (옛 prod = root vite)
npm run dev          # → http://localhost:5173

# 새 admin (Next.js)
cd apps/admin
npm run dev          # → http://localhost:3001

# 빌드 (둘 다 한 번에)
npm run build        # root vite → dist/
```

### 검증 한 줄
```bash
npm run check-all    # typecheck + test + build + bundle size 한 번에
```

## 2. 디렉토리 구조

```
.
├── apps/admin/                  # 새 admin (Next.js)
│   ├── app/                     # App Router 페이지
│   │   ├── admin/               # /admin/* 라우트 (대시보드/사용자/업체/방/메모/...)
│   │   ├── api/                 # Next.js API routes (트RPC + admin-login)
│   │   └── layout.tsx           # 루트 layout + FOUC fix
│   ├── components/              # React 컴포넌트
│   │   ├── ui/                  # shadcn/ui (Button / Card / Dialog / Toast / ...)
│   │   ├── Sidebar.tsx          # 사이드바 (모바일 drawer 지원)
│   │   └── ThemeToggle.tsx      # 다크/라이트 토글
│   ├── lib/                     # 헬퍼
│   │   ├── format.ts            # 날짜/금액/사용자명 포맷 (단일 진실)
│   │   ├── hooks/               # useDebouncedValue / useFocusTrap
│   │   ├── mutation-invalidate.ts # React Query invalidation matrix
│   │   ├── rate-limit.ts        # D1 기반 rate limit
│   │   └── trpc.ts              # tRPC 클라이언트
│   ├── functions/api/           # 옛 Cloudflare Pages Functions (그대로 import)
│   └── public/                  # 옛 admin.html 등 정적 자산 복사
├── packages/
│   ├── api/                     # tRPC 라우터 (Drizzle ORM)
│   ├── auth/                    # Auth.js + RBAC catalog
│   ├── db/                      # Drizzle schema + migrations
│   ├── ai/                      # FAQ / RAG / chat 로직
│   ├── types/                   # 공통 타입
│   └── ui/                      # 공통 컴포넌트 (UI 추출 진행 중)
├── functions/api/               # 거래처 챗봇 API (Cloudflare Pages Functions)
├── src/                         # 거래처 챗봇 entry (Vite)
│   ├── react/                   # 옛 admin 안 React mount points
│   ├── admin/                   # TS 변환된 admin 헬퍼 (mentions.ts / message-parser.ts)
│   └── ...
├── e2e/                         # Playwright e2e
├── scripts/                     # 빌드/검증 스크립트
├── docs/                        # 가이드 + ADR + 정책
└── .github/workflows/           # CI/CD
```

## 3. 핵심 패턴

### tRPC 라우터 작성
```ts
// packages/api/src/routers/example.ts
import { z } from 'zod';
import { router, viewerProcedure, ownerProcedure } from '../trpc';
import { logger, logCtx } from '../logger';
import { drizzle, schema } from '@sewmu/db/client';

export const exampleRouter = router({
  list: viewerProcedure
    .input(z.object({ limit: z.number().int().max(1000).default(100) }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      // ...
      return { items: [] };
    }),
  delete: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // ... delete
        await audit({ ctx, action: 'example.delete', target_type: 'example', target_id: input.id });
        return { ok: true };
      } catch (e) {
        logger.error('example delete failed', logCtx(ctx, 'example.delete'), e);
        throw e;
      }
    }),
});
```

권한 단계 (Notion 5-tier):
- `ownerProcedure` — 사장님만
- `adminProcedure` — admin 이상
- `editorProcedure` — editor 이상
- `viewerProcedure` — viewer 이상
- `customerProcedure` — 로그인 사용자

### React Query mutation 후 invalidation
```tsx
import { invalidateAfter } from '@/lib/mutation-invalidate';

const m = useMutation({
  mutationFn: () => trpcCall('users.setStatus', { userId, status }),
  onSuccess: () => {
    toast.success('완료');
    /* 영향받는 영역 명시 — sidebar 자동 포함 */
    invalidateAfter(queryClient, { users: true });
  },
});
```

### confirm() 대신 ConfirmDialog
```tsx
import { confirm } from '@/components/ui/confirm-dialog';

async function handleDelete() {
  const ok = await confirm({
    title: '삭제',
    description: '정말 삭제하시겠습니까?',
    variant: 'destructive',
  });
  if (!ok) return;
  doDelete();
}
```

### 날짜/금액 포맷
```tsx
import { formatDateTime, formatWon, formatUserName } from '@/lib/format';

<p>{formatDateTime(row.created_at)}</p>     {/* "2026-05-12 18:34" */}
<p>{formatWon(row.amount)}</p>              {/* "1,234,567원" */}
<p>{formatUserName(user)}</p>               {/* real_name → name → #id */}
```

### 검색 input debounce
```tsx
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

const [raw, setRaw] = useState('');
const search = useDebouncedValue(raw, 250);

useQuery({ queryKey: ['users.list', search], queryFn: ... });
```

## 4. 보안 절대 규칙

- ❌ **Cloudflare 대시보드 / wrangler.toml 손대지 말 것** — D1 binding 날아간 사고 있음
- ❌ **사용자 권한 자동 변경 금지** — set_admin / approval_status 는 사장님 명시 명령만
- ❌ **공개 procedure 에서 `e.message` raw 노출 금지** — CLAUDE.md `packages/auth` 룰
- ❌ **`as any` 금지** — `D1Database` / `R2Bucket` proper 타입 사용
- ❌ **PII 로깅 금지** — phone/email/real_name 자동 redact (`packages/api/src/logger.ts`)
- ✅ **mutation 후 `invalidateAfter()` 호출** — UI 즉시 갱신
- ✅ **CSRF Origin/Referer 가드** — POST/PUT/DELETE 모두 `checkOriginCsrf()` 통과
- ✅ **Rate limit** — login + 폭주 가능 endpoint 모두 (`rateLimit(db, key, limit, windowSec)`)

## 5. 테스트

```bash
# 단위 + 통합 (vitest)
npm test                  # 전체
npm test users           # 매칭 파일만

# e2e (Playwright)
npx playwright install chromium
npm run e2e              # 인증 spec 은 E2E_ADMIN_KEY secret 필요
E2E_ADMIN_KEY=xxx npm run e2e   # 인증 spec 도 포함
```

테스트 작성 룰:
- 라우터: `packages/api/src/routers/__tests__/*.integration.test.ts` (Drizzle + better-sqlite3 미니 D1)
- 헬퍼: 같은 디렉토리에 `*.test.ts` 콜로케이션
- React 컴포넌트: 같은 디렉토리에 `*.test.tsx` (RTL + happy-dom)
- e2e: `e2e/NN-*.spec.ts` (Playwright)

## 6. 배포

```bash
# main 푸시 → Cloudflare Pages 자동 배포 (2-3분)
git push origin main
```

CI gate (.github/workflows/ci.yml):
- typecheck (root + apps/admin)
- vitest (1000+ tests)
- build + bundle size budget
- ESLint (non-blocking)

Cloudflare Pages 환경변수 (사장님 대시보드에서 설정):
- `OPENAI_API_KEY` / `LAW_API_OC` / `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET`
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`
- `ADMIN_KEY` / `AUTH_SECRET`
- `SENTRY_DSN` (선택) — 설정 시 자동 활성

## 7. DB 변경

```bash
# 1. Schema 수정
vim packages/db/schema/users.ts

# 2. Migration 파일 작성
vim packages/db/migrations/0003_my_change.sql

# 3. 사장님께 보고 + 적용 절차 안내
npx wrangler d1 execute DB --remote --file=packages/db/migrations/0003_my_change.sql
```

룰: 새 컬럼/테이블은 반드시 migration 파일 (lazy ALTER 패턴 deprecate).
자세히: `packages/db/migrations/README.md`.

## 8. 흔한 문제

- **`@/` 가 src/ 가리키네 (테스트 깨짐)**: vitest.config.ts 의 alias 가 apps/admin 의
  `@/lib/*`, `@/components/*` 별도 매핑. 새 경로 추가하면 vitest.config 도 업데이트.
- **Cloudflare 빌드 큐 늦음**: 평소 2분, 빌드 큐 부하 시 10분+. 사장님 새로고침
  타이밍 좋게.
- **다크모드 깜빡임 (FOUC)**: `apps/admin/app/layout.tsx` 의 inline `<script>` 가
  paint 전 dark 클래스 적용 — 절대 지우지 말 것.

## 9. 사장님 직접 작업

- Cloudflare 대시보드 (D1/R2/KV/env vars 설정)
- DB migration 적용 (`wrangler d1 execute`)
- Sentry / Slack / 외부 서비스 가입
- 사용자 권한 변경 (admin UI 에서)

## 10. 도움

- `CLAUDE.md` (root) — Claude 작업 룰
- `apps/admin/CLAUDE.md` — admin UI 룰
- `packages/api/CLAUDE.md` — tRPC 룰
- `packages/db/CLAUDE.md` — Drizzle 룰
- `packages/auth/CLAUDE.md` — Auth 룰
- `CHANGELOG.md` — Phase 별 변경 이력
