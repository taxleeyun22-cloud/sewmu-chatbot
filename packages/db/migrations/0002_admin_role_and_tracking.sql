-- Phase 13 (2026-05-12): users.admin_role 컬럼 + _migrations 트래킹 테이블.
--
-- 사용:
--   npx wrangler d1 execute DB --remote --file=packages/db/migrations/0002_admin_role_and_tracking.sql
--
-- Phase 11 (2026-05-11) 에서 lazy ALTER 로 추가됐던 admin_role 컬럼을
-- 정식 migration 으로 승격. 또한 향후 migration 추적을 위한 _migrations 테이블 신설.
--
-- Idempotent — 이미 적용된 경우 IF NOT EXISTS / OR IGNORE 로 skip.

-- =====================================================================
-- 1. Migration 추적 테이블
-- =====================================================================
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  checksum TEXT
);

-- 기존 0001 도 추적 표시 (idempotent)
INSERT OR IGNORE INTO _migrations (name, applied_at, checksum)
VALUES ('0001_new_tables', datetime('now'), 'baseline');

-- =====================================================================
-- 2. users.admin_role — Notion 5단계 RBAC
--    Phase 11 (2026-05-11) lazy ALTER 로 prod 적용됨. 정식화.
--    값: 'owner' | 'admin' | 'editor' | 'viewer' | NULL (customer)
-- =====================================================================
-- D1 SQLite 은 IF NOT EXISTS 지원 안 함 — try/catch 패턴 (wrangler 가 error 무시).
-- 이미 컬럼 있으면 statement 실패 → 다음 줄 계속 진행.
ALTER TABLE users ADD COLUMN admin_role TEXT;

-- =====================================================================
-- 3. error_logs.context — JSON meta (Phase 12 PII redaction 결과 적재)
--    이미 컬럼 있는지 확인 후 (옛 admin 에서 lazy 추가됐을 수 있음).
-- =====================================================================
-- error_logs 테이블 자체는 0001 에서 생성됨. context 컬럼은 그때 포함.
-- 추가 인덱스만:
CREATE INDEX IF NOT EXISTS idx_error_logs_created
  ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source_resolved
  ON error_logs(source, resolved);

-- =====================================================================
-- 4. audit_logs 인덱스 (사장님 audit_logs 화면 빠르게)
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs(actor_user_id);

-- =====================================================================
-- 5. 이 migration 자체 추적 표시
-- =====================================================================
INSERT OR IGNORE INTO _migrations (name, applied_at, checksum)
VALUES ('0002_admin_role_and_tracking', datetime('now'), 'phase13');
