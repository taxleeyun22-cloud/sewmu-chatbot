# DB Migrations — Phase 13 (2026-05-12)

D1 schema 변경 트래킹. 옛 admin (`functions/api/*.js`) 의 `ALTER TABLE … IF NOT EXISTS`
런타임 패턴 + 새 admin (Drizzle) 정식 마이그레이션 공존.

## 정책

1. **신규 컬럼/테이블 추가 시 반드시 이 디렉토리에 `NNNN_*.sql` 파일 신규 작성**.
   - 번호: 4자리 zero-pad (`0001`, `0002`, …)
   - 이름: snake_case, 무슨 변경인지 명확 (`0003_add_audit_logs.sql`)
2. 같은 파일 안에 `IF NOT EXISTS` / `try {} catch {}` 패턴으로 idempotent 작성.
   - 재실행 안전 — 사장님이 prod D1 에 적용할 때 한 번에 안 끝나도 OK
3. 옛 admin 의 lazy ALTER 패턴 (`try { ALTER TABLE … } catch {}`) 은
   **deprecate** — 새 변경은 이 디렉토리 only. 기존 lazy 는 유지 (회귀 위험).

## 적용 절차 (사장님)

```bash
# 1. dry-run — schema 변경 확인
npx wrangler d1 execute DB --remote --command="SELECT name FROM sqlite_master WHERE type='table'"

# 2. 새 migration 적용
npx wrangler d1 execute DB --remote --file=packages/db/migrations/0002_admin_role.sql

# 3. 적용 후 _migrations 테이블 확인
npx wrangler d1 execute DB --remote --command="SELECT * FROM _migrations ORDER BY applied_at DESC LIMIT 10"
```

자동 추적: 각 migration 파일 끝에 `INSERT OR IGNORE INTO _migrations` 추가
(아래 0002 참조).

## 인벤토리 (옛 admin lazy ALTER — 정리 안 됨, 참고만)

`functions/api/admin-approve.js` / `admin-businesses.js` /
`admin-bulk-import-clients.js` 안에 40+ lazy ALTER TABLE 존재 — Cloudflare
환경에서 첫 호출 시 자동 추가. 사장님 prod 에는 모두 적용된 상태.

이 디렉토리 의 `0001_new_tables.sql` 가 신규 테이블 (accounts /
verification_tokens / audit_logs / 등) 만 다룸. 옛 컬럼은 admin endpoint 호출
시 자동 추가됨.

향후 깨끗한 환경 (preview branch / fresh D1) 에 배포 시:
1. `0001_new_tables.sql` 적용
2. 옛 admin endpoint 한 번씩 호출 → lazy ALTER 발동
3. 또는 별도 `0099_legacy_columns_baseline.sql` 한 번에 정리 (TODO)

## Drizzle 자동 생성 (선택)

`packages/db/drizzle.config.ts` 설정돼 있음. schema 수정 후:

```bash
cd packages/db
npx drizzle-kit generate
# → migrations/NNNN_*.sql 자동 생성 (단, 옛 lazy 컬럼 인식 안 함 — 수동 확인 필요)
```
