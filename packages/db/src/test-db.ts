/**
 * Phase Next-Day23 (2026-05-09): in-memory test DB.
 *
 * Node 22+ built-in node:sqlite + drizzle-orm/sqlite-proxy.
 * Cloudflare D1 의 .prepare/.bind/.run/.all/.first 인터페이스를 흉내내는
 * minimal wrapper 도 같이 제공 (라우터의 raw SQL fallback 호환).
 *
 * 사용 (테스트):
 *   import { createTestDb } from '@sewmu/db/test-db';
 *   const { db, d1 } = createTestDb();      // d1 = D1 호환, db = drizzle 인스턴스
 *
 * 통합 테스트 가능:
 *   - tRPC procedure 의 ctx.db 자리에 d1 inject
 *   - 라우터의 drizzle(ctx.db) 가 실제 SQL 실행
 *   - INSERT / SELECT / UPDATE / JOIN 모두 동작
 */
import { drizzle as drizzleProxy } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../schema';

/* node:sqlite is a Node 22+ built-in — load via createRequire to bypass Vite resolver. */
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/** D1Database 호환 wrapper (라우터 raw SQL fallback 지원). */
export interface D1Compat {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<{ count: number; duration: number }>;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
  all(): Promise<{ results: any[]; success: boolean }>;
  first(): Promise<any | null>;
}

type RawDb = InstanceType<typeof DatabaseSync>;

/** node:sqlite → D1 호환 wrapper. */
function makeD1Compat(rawDb: RawDb): D1Compat {
  return {
    prepare(sql: string): D1PreparedStatement {
      let bindArgs: any[] = [];
      const stmt = {
        bind(...values: any[]) {
          bindArgs = values;
          return stmt;
        },
        async run() {
          const s = rawDb.prepare(sql);
          const r = s.run(...bindArgs);
          return {
            success: true,
            meta: {
              changes: Number(r.changes),
              last_row_id: Number(r.lastInsertRowid),
            },
          };
        },
        async all() {
          const s = rawDb.prepare(sql);
          const rows = s.all(...bindArgs);
          return { results: rows as any[], success: true };
        },
        async first() {
          const s = rawDb.prepare(sql);
          const row = s.get(...bindArgs);
          return (row as any) ?? null;
        },
      };
      return stmt;
    },
    async exec(sql: string) {
      rawDb.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

/** Schema 적용 — Drizzle schema 의 모든 테이블 CREATE TABLE 실행.
 *  drizzle-kit migration 없이 직접 DDL (테스트 용).
 */
function applySchema(rawDb: RawDb): void {
  const ddls = [
    `CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      provider_id TEXT,
      name TEXT,
      real_name TEXT,
      email TEXT,
      email_verified TEXT,
      phone TEXT,
      profile_image TEXT,
      approval_status TEXT DEFAULT 'pending',
      approved_at TEXT,
      is_admin INTEGER DEFAULT 0,
      is_owner INTEGER DEFAULT 0,
      staff_role TEXT,
      admin_role TEXT,
      name_confirmed INTEGER DEFAULT 0,
      birth_date TEXT,
      company_name TEXT,
      ceo_name TEXT,
      business_number TEXT,
      import_batch_id INTEGER,
      active_merge_id INTEGER,
      is_likely_merged INTEGER DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT,
      last_login_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      business_number TEXT,
      sub_business_number TEXT,
      corporate_number TEXT,
      ceo_name TEXT,
      company_form TEXT,
      business_category TEXT,
      industry TEXT,
      industry_code TEXT,
      tax_type TEXT,
      address TEXT,
      phone TEXT,
      establishment_date TEXT,
      closed_date TEXT,
      fiscal_year_start TEXT,
      fiscal_year_end TEXT,
      fiscal_term INTEGER,
      contract_date TEXT,
      hr_year INTEGER,
      parent_business_id INTEGER,
      status TEXT DEFAULT 'active',
      notes TEXT,
      hometax_password_enc TEXT,
      import_batch_id INTEGER,
      deleted_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE chat_rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT DEFAULT 'active',
      ai_mode TEXT DEFAULT 'on',
      is_internal INTEGER DEFAULT 0,
      business_id INTEGER,
      priority INTEGER DEFAULT 0,
      phone TEXT,
      created_by_user_id INTEGER,
      created_at TEXT,
      updated_at TEXT,
      closed_at TEXT
    )`,
    `CREATE TABLE room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      visible_since TEXT,
      joined_at TEXT,
      left_at TEXT,
      last_read_at TEXT
    )`,
    `CREATE TABLE room_businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      business_id INTEGER NOT NULL,
      is_primary INTEGER DEFAULT 0,
      linked_at TEXT,
      removed_at TEXT
    )`,
    `CREATE TABLE room_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT,
      ord INTEGER DEFAULT 0,
      created_at TEXT
    )`,
    `CREATE TABLE room_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      content TEXT,
      is_pinned INTEGER DEFAULT 0,
      created_by_user_id INTEGER,
      created_at TEXT
    )`,
    `CREATE TABLE memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user_id INTEGER,
      target_business_id INTEGER,
      room_id TEXT,
      memo_type TEXT,
      category TEXT,
      content TEXT NOT NULL,
      tags TEXT,
      attachments TEXT,
      due_date TEXT,
      assigned_to_user_id INTEGER,
      author_id INTEGER,
      author_name TEXT,
      is_checked INTEGER DEFAULT 0,
      checked_at TEXT,
      checked_by TEXT,
      deleted_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      user_id INTEGER,
      room_id TEXT,
      role TEXT NOT NULL,
      content TEXT,
      confidence TEXT,
      reviewed INTEGER DEFAULT 0,
      reported INTEGER DEFAULT 0,
      reviewed_by TEXT,
      reviewed_at TEXT,
      document_id INTEGER,
      unread_count INTEGER,
      deleted_at TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT,
      created_at TEXT,
      last_accessed_at TEXT
    )`,
    `CREATE TABLE daily_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 0
    )`,
    `CREATE TABLE filings (
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
    )`,
    `CREATE TABLE tax_filings (
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
    )`,
    `CREATE TABLE faqs (
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
    )`,
    `CREATE TABLE accounts (
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
    )`,
    `CREATE TABLE verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires TEXT NOT NULL,
      PRIMARY KEY (identifier, token)
    )`,
    `CREATE TABLE documents (
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
    )`,
    `CREATE TABLE business_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      is_primary INTEGER DEFAULT 0,
      role TEXT,
      created_at TEXT,
      removed_at TEXT
    )`,
    `CREATE TABLE error_logs (
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
    )`,
    `CREATE TABLE audit_logs (
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
    )`,
  ];
  for (const ddl of ddls) {
    rawDb.exec(ddl);
  }
}

/**
 * 테스트 DB 생성.
 *
 * @returns
 *   - rawDb: node:sqlite DatabaseSync (low-level)
 *   - d1: D1Database 호환 wrapper (라우터 ctx.db 자리에 inject)
 *   - db: drizzle 인스턴스 (sqlite-proxy 통해 rawDb 와 연결)
 */
export function createTestDb() {
  const rawDb = new DatabaseSync(':memory:');
  applySchema(rawDb);

  const d1 = makeD1Compat(rawDb);

  /* drizzle sqlite-proxy 의 driver fn — sql + params 받아서 실행 후 rows 반환.
   *
   * node:sqlite는 boolean 미지원 — 0/1 로 변환.
   * Drizzle 은 placeholder 를 ? 로 교체 후 params 배열로 전달.
   */
  const normalizeParams = (params: unknown[]) =>
    params.map((p) => {
      if (p === true) return 1;
      if (p === false) return 0;
      if (p === undefined) return null;
      return p;
    });

  const db = drizzleProxy(
    async (sql, params, method) => {
      try {
        const stmt = rawDb.prepare(sql);
        const np = normalizeParams(params);
        if (method === 'run') {
          const r = stmt.run(...np);
          return {
            rows: [],
            rowsAffected: Number(r.changes),
            lastInsertRowid: Number(r.lastInsertRowid),
          };
        }
        if (method === 'get') {
          const row = stmt.get(...np);
          return { rows: row ? [Object.values(row as Record<string, unknown>)] : [] };
        }
        const rows = stmt.all(...np);
        return { rows: rows.map((r) => Object.values(r as Record<string, unknown>)) };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[test-db] SQL error:', sql, params, (e as Error).message);
        throw e;
      }
    },
    { schema },
  ) as any;

  return { rawDb, d1, db };
}

export { schema };
