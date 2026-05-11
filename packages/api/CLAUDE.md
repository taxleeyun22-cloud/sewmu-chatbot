# packages/api — Claude 작업 규약 (tRPC + audit)

tRPC v11 procedures. 모든 admin / 거래처 데이터 access 의 진입점.

## 영역
- `src/routers/` — tRPC routers (users / businesses / rooms / memos / etc)
- `src/routers/__tests__/` — integration tests (vitest)
- `src/audit.ts` — audit() helper (모든 mutation 자동 로깅)
- `src/context.ts` — tRPC ctx (D1 / auth / RBAC)

## 룰

### tRPC 패턴
- **Query** (read): `procedure.query()` → GET 호출
- **Mutation** (write): `procedure.mutation()` → POST 호출
- Client 자동 분기: `apps/admin/lib/trpc.ts` 의 MUTATION_PATTERN regex

### Procedure naming
- `users.list` / `users.setStatus` (kebab → camel, dot 으로 router 구분)
- mutation suffix: `create`/`update`/`delete`/`approve`/`reject`/`send`/`set*`/`link*`/`mark*`/`patch*` 등

### Audit log (자동)
```ts
import { audit } from '@/audit';

export const usersRouter = router({
  setStatus: ownerProcedure
    .input(z.object({ userId: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.select().from(users).where(eq(users.id, input.userId)).get();
      // ... 실행 ...
      const after = await ctx.db.select().from(users).where(eq(users.id, input.userId)).get();
      await audit({ ctx, action: 'users.setStatus', target_type: 'user', target_id: input.userId, before, after });
      return { ok: true };
    }),
});
```

### RBAC 적용
- `publicProcedure` — 누구나
- `authenticatedProcedure` — 로그인 (Auth.js session 또는 admin_key_auth cookie)
- `adminProcedure` — is_admin=1
- `ownerProcedure` — user_id=1 (사장님) 또는 ADMIN_KEY

owner-only actions (CLAUDE.md catalog):
- admin:user:delete
- admin:business:cascade_delete
- admin:memo:bulk_delete
- admin:trash:purge
- admin:room:msg_bulk_delete
- admin:bulk_send:send
- admin:rbac:promote
- admin:rbac:demote

## 단위 테스트 (Vitest + 미니 D1)

각 router 마다 integration test:
- `routers/__tests__/users.integration.test.ts`
- `routers/__tests__/memos.integration.test.ts`
- 등 

테스트 패턴:
1. 인-메모리 D1 (better-sqlite3 + drizzle)
2. seed 데이터 (testUsers / testBusinesses / 등)
3. createCaller (직접 procedure 호출, HTTP 우회)
4. assertion (응답 + DB 상태 검증)

총 943 tests 통과 중 (2026-05-11).

## 🔄 Mutation done 룰 (frontend 통합)

apps/admin/lib/trpc.ts 의 client 가 자동 분기:
- query (= GET) → 같은 URL `?input=...`
- mutation (= POST) → POST body

옛 admin.html 의 `mutationDone({users, businesses, rooms, memos})` 룰이 새 admin 의 tRPC mutation 후에도 호출되어야 함:
- 사이드바 카운트 갱신
- 영향받는 list 자동 reload
- React 컴포넌트의 store 자동 update (nanostores 패턴)

## 🚫 사용자 권한·Status 자동 변경 금지 (2026-05-08)

**과거 사고**: Claude (나) 가 이재윤·채승용 admin 권한 자동으로 set_admin=1 SET 3번 반복.

**룰**:
- 사용자 권한 (`is_admin`, `staff_role`) 및 status (`approval_status`) 변경은 **사장님이 직접 admin UI 에서 관리**
- Claude 가 자동으로 set_admin / approval_status / staff_role 변경 **절대 금지**
- 사장님 명시 명령 받을 때만 실행:
  - "이재윤 admin 으로 만들어줘" / "박승호 기장거래처 승급해줘"
- "admin counts 줄어들면 reset" / "관리자 4명이 정상" 같은 자동 가정 X
- `set_admin auto-status` 같은 자동 흐름 (대기 → 관리자 승급 시 status='approved_client' 자동 변경) 은 사장님 명시 명령 (2026-05-08 fix) 만 유지. 그 외 cascading SET 금지.

**예외**:
- 사장님이 직접 클릭한 흐름 (admin UI 의 "관리자 승급" 버튼) 은 그 코드 안에서 set_admin 호출 OK
- 사장님이 명시 명령한 외부 호출 OK

**위반 시**: Claude 가 사장님 결정 무시 + 데이터 인위 변경. 사장님 짜증·신뢰 ↓.
