# packages/db — Claude 작업 규약 (Drizzle ORM + D1)

D1 SQLite schema. 옛 admin 의 raw SQL + lazy migration 패턴과 새 Drizzle ORM 패턴 공존.

## 영역
- `schema/` — Drizzle table definitions
  - users / sessions / conversations / daily_usage (옛 admin 사용)
  - accounts / verification_tokens (Auth.js)
  - business_members / filings / tax_filings / faqs / documents / error_logs / audit_logs / room_businesses / room_labels / room_notices (2026-05-11 추가)
- `migrations/` — Drizzle migrations (`drizzle-kit generate`)
- `client.ts` — `drizzle(env.DB)` factory

## 같은 D1 인스턴스 공유

`apps/admin/auth.ts` 명시:
> "같은 D1 DB 공유 — 사장님 카톡 = 양쪽에서 같은 user_id"

= sewmu-chatbot.pages.dev (옛 admin) 와 sewmu-admin.pages.dev (새 admin) 같은 D1 binding `DB` 사용.

## Lazy migration 패턴 (옛 admin 호환)

옛 admin-*.js 들은 endpoint 안에서 lazy ALTER TABLE:

```js
try {
  await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run();
} catch {}
```

= 컬럼 없으면 추가, 있으면 무시. Drizzle migration 과 충돌 X (같은 컬럼 이미 있으면 ALTER 실패 → catch).

## Drizzle 사용 룰

### Schema 정의
```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  real_name: text('real_name'),
  is_admin: integer('is_admin').default(0),
  approval_status: text('approval_status'),
  // ...
});
```

### Query 패턴
```ts
import { drizzle } from '@sewmu/db/client';
import * as schema from '@sewmu/db';
import { eq, and, desc } from 'drizzle-orm';

const db = drizzle(env.DB);
const rows = await db
  .select()
  .from(schema.users)
  .where(eq(schema.users.is_admin, 1))
  .limit(50);
```

### Migration 패턴 (신규)
1. Schema 수정 (`schema/*.ts`)
2. `npx drizzle-kit generate` → `migrations/*.sql` 생성
3. Cloudflare D1 console 에서 migration 실행 (또는 자동 lazy migration)

## DB schema 가이드

### users 핵심 컬럼
- `id` (PK)
- `name` — 카톡 닉네임
- `real_name` — 실명 (가입 시 확인 필수)
- `email`, `phone`, `phone_number`
- `provider` ('kakao' | 'naver' | 'manual')
- `approval_status` ('pending' | 'approved_client' | 'rejected' | 'terminated' | 'rejoined')
- `is_admin` (0/1)
- `staff_role` ('owner' | 'admin' | NULL) — RBAC catalog (2026-05-08)
- `created_at` / `last_login_at` / `email_verified`

### 주요 테이블
- **users** — 사용자 (거래처 + admin)
- **sessions** — 옛 admin 세션 토큰
- **conversations** — chat.js 대화 이력
- **daily_usage** — 일일 사용 카운트 (pending 5건/일 제한)
- **businesses** — 업체
- **business_members** — 업체 ↔ 사람 N:N
- **room_businesses** — 상담방 ↔ 업체 N:N
- **chat_rooms / room_members** — 상담방
- **memos** — 메모 (7카테고리 + 첨부 + 태그)
- **documents** — 영수증/문서
- **client_finance** — 거래처 재무 (분기별)
- **faqs** — RAG 임베딩 (Q1~Q71+)
- **error_logs** — 자체 에러 로거
- **audit_logs** — 모든 mutation 자동 로깅
- **filings / tax_filings** — 신고 검토표

## 🚨 Cloudflare 대시보드 금지

- ❌ `wrangler.toml` 생성/수정 금지 (D1 binding override 사고)
- ❌ `_routes.json`, `_headers` 등 인프라 설정 손대지 말 것
- ❌ 바인딩 (R2 / D1 / KV) · 환경변수 코드로 우회/override 시도 금지
- ✅ 코드는 `context.env.DB`, `context.env.MEDIA_BUCKET` 사용만
- ✅ 바인딩·환경변수는 사용자가 직접 대시보드에서 관리
- 바인딩 문제 발생 시 = 사용자에게 대시보드 조작 **안내만**, 코드 우회 X
