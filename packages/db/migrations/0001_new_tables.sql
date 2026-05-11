-- Phase Next-Day27 (2026-05-11): D1 신규 테이블 마이그레이션.
--
-- 사용 (사장님):
--   npx wrangler d1 execute DB --remote --file=packages/db/migrations/0001_new_tables.sql
--
-- 옛 시스템 영향 0 — 신규 테이블만 추가 (기존 테이블 변경 X).
-- IF NOT EXISTS 로 idempotent (재실행 안전).

-- =====================================================================
-- 1. Auth.js 표준 (accounts + verification_tokens)
-- =====================================================================
CREATE TABLE IF NOT EXISTS accounts (
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- =====================================================================
-- 2. users.email_verified (Auth.js 표준 컬럼)
-- =====================================================================
-- Lazy ALTER — 컬럼 이미 있으면 skip
-- D1 은 ALTER TABLE 한 줄씩만 가능
-- (수동 실행 시 에러 무시 OK)
-- ALTER TABLE users ADD COLUMN email_verified TEXT;

-- =====================================================================
-- 3. business_members (사람 ↔ 업체 N:N)
-- =====================================================================
CREATE TABLE IF NOT EXISTS business_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_primary INTEGER DEFAULT 0,
  role TEXT,
  created_at TEXT,
  removed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_business_members_user ON business_members(user_id);
CREATE INDEX IF NOT EXISTS idx_business_members_business ON business_members(business_id);

-- =====================================================================
-- 4. filings (신고 검토표)
-- =====================================================================
CREATE TABLE IF NOT EXISTS filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  included_business_ids TEXT,
  auto_fields TEXT,
  review_status TEXT DEFAULT '작성중',
  reviewer_comment TEXT,
  author_user_id INTEGER,
  reviewer_user_id INTEGER,
  reviewed_at TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_filings_owner ON filings(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_filings_year ON filings(fiscal_year);

-- =====================================================================
-- 5. tax_filings (간단 체크리스트 — 부가세/원천세 마감 등)
-- =====================================================================
CREATE TABLE IF NOT EXISTS tax_filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER,
  user_id INTEGER,
  filing_type TEXT,
  period_year INTEGER,
  period_label TEXT,
  due_date TEXT,
  status TEXT DEFAULT 'pending',
  amount_estimated INTEGER,
  amount_actual INTEGER,
  submitted_at TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tax_filings_due ON tax_filings(due_date);
CREATE INDEX IF NOT EXISTS idx_tax_filings_status ON tax_filings(status);

-- =====================================================================
-- 6. faqs (RAG 본체 — Q1~Q71+ embedding)
-- =====================================================================
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  q_number INTEGER,
  category TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  law_refs TEXT,
  embedding TEXT,
  active INTEGER DEFAULT 1,
  verified_status TEXT,
  verified_note TEXT,
  verified_at TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_faqs_q_number ON faqs(q_number);
CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs(active);

-- =====================================================================
-- 7. documents (영수증 / 계약서 — OCR 자동 분석)
-- =====================================================================
-- 옛 admin-documents.js 의 CREATE TABLE 과 동일 구조 + business_id 추가
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  business_id INTEGER,
  room_id TEXT,
  doc_type TEXT NOT NULL,
  image_key TEXT NOT NULL,
  ocr_status TEXT DEFAULT 'pending',
  ocr_model TEXT,
  ocr_raw TEXT,
  ocr_confidence REAL,
  vendor TEXT,
  vendor_biz_no TEXT,
  amount INTEGER,
  vat_amount INTEGER,
  receipt_date TEXT,
  category TEXT,
  category_src TEXT,
  items TEXT,
  status TEXT DEFAULT 'pending',
  approver_id INTEGER,
  approved_at TEXT,
  reject_reason TEXT,
  note TEXT,
  deleted_at TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_business ON documents(business_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- =====================================================================
-- 8. error_logs (🐞 무당벌레)
-- =====================================================================
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  user_id INTEGER,
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  user_agent TEXT,
  context TEXT,
  resolved INTEGER DEFAULT 0,
  resolved_at TEXT,
  resolved_by INTEGER,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);

-- =====================================================================
-- 9. audit_logs (Stripe / Notion 패턴 — 사장님 명시 결정 2026-05-11)
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  before TEXT,
  after TEXT,
  result TEXT DEFAULT 'success',
  error_message TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- =====================================================================
-- 10. room_businesses (1방 N업체 — 사장님 결정 Phase M11)
-- =====================================================================
CREATE TABLE IF NOT EXISTS room_businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  business_id INTEGER NOT NULL,
  is_primary INTEGER DEFAULT 0,
  linked_at TEXT,
  removed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_room_businesses_room ON room_businesses(room_id);
CREATE INDEX IF NOT EXISTS idx_room_businesses_biz ON room_businesses(business_id);

-- =====================================================================
-- 11. room_labels (담당자 라벨 — 예슬/정은/민지/영철)
-- =====================================================================
CREATE TABLE IF NOT EXISTS room_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT,
  ord INTEGER DEFAULT 0,
  created_at TEXT
);

-- =====================================================================
-- 12. room_notices (방별 공지)
-- =====================================================================
CREATE TABLE IF NOT EXISTS room_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  content TEXT,
  is_pinned INTEGER DEFAULT 0,
  created_by_user_id INTEGER,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_room_notices_room ON room_notices(room_id);

-- =====================================================================
-- 완료
-- =====================================================================
-- 12 테이블 (또는 컬럼) 추가됨.
-- 옛 시스템 영향: 0 (기존 테이블 변경 X).
-- 새 Next.js: 즉시 사용 가능.
