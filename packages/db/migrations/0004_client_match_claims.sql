-- 2026-10-20: 거래처 가입 시 본인 확인용 입력값 (카톡 로그인 ↔ 위하고 거래처 매칭).
--
-- 사용:
--   npx wrangler d1 execute DB --remote --file=packages/db/migrations/0004_client_match_claims.sql
--
-- functions/api/_client-match.js 의 ensureClaimColumns() 와 같은 DDL 이다. 이 파일을 돌리기 전에도
-- 첫 호출에 컬럼이 생기므로 기능은 바로 동작한다. 이미 컬럼이 있으면 ALTER 가 실패하고 다음 줄로 넘어간다.
--
-- 고객이 가입할 때 "기장거래처" 를 고르면 생년월일 8자리 + 사업자번호 하나를 적는다.
-- 이 값은 사장님 검토 화면의 후보 찾기에만 쓰이고, 사업장 연결은 사장님 [연결] 버튼으로만 한다.
-- users.birth_date 와는 따로 둔다 (고객이 적은 값 ≠ 위하고에서 확인된 값).
-- packages/db/src/schema/users.ts 에는 넣지 않는다 (select-all 이 컬럼 없는 DB 에서 깨진다 — 기존 lazy 컬럼과 같은 이유).

ALTER TABLE users ADD COLUMN claim_birth_date TEXT;       -- 'YYYY-MM-DD'
ALTER TABLE users ADD COLUMN claim_business_number TEXT;  -- 숫자 10자리
ALTER TABLE users ADD COLUMN claim_at TEXT;

INSERT OR IGNORE INTO _migrations (name, applied_at, checksum)
VALUES ('0004_client_match_claims', datetime('now'), 'client-match-claims-v1');
