// 관리자 수동 거래처 등록
// OAuth 없이 관리자가 직접 거래처 레코드 생성 (오프라인 고객·기존 거래처 마이그레이션용)
//
// POST /api/admin-clients
//   body: { name, real_name?, phone?, business_number?, company_name?, ceo_name?, notes? }
//   → users 테이블 insert (provider='admin_created', approval_status='approved_client')
//   → 선택: client_businesses insert
//   → 응답: { ok, user_id }
//
// 보안:
// - checkAdmin 인증 (ADMIN_KEY or 스태프 세션)
// - provider='admin_created' 로 명시 → 로그인·세션 절대 못 만듦
// - 민감 정보 없음 (주민번호 X)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

function sanitizeName(s) {
  return String(s || '').trim().replace(/[\r\n\t\x00-\x1f]/g, '').slice(0, 50);
}

function sanitizePhone(s) {
  return String(s || '').trim().replace(/[^\d\-]/g, '').slice(0, 20);
}

function sanitizeBiz(s) {
  /* 사업자번호: 숫자·하이픈만 10~12자 */
  return String(s || '').trim().replace(/[^\d\-]/g, '').slice(0, 15);
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  const realName = sanitizeName(body.real_name || body.name || '');
  const displayName = sanitizeName(body.name || body.real_name || '');
  const phone = sanitizePhone(body.phone);
  const businessNumber = sanitizeBiz(body.business_number);
  const companyName = sanitizeName(body.company_name);
  const ceoName = sanitizeName(body.ceo_name || body.real_name);
  const notes = String(body.notes || '').trim().slice(0, 1000);

  if (!realName) return Response.json({ error: "이름(real_name) 필수" }, { status: 400 });

  const now = kst();

  /* users 컬럼 보장 — 기존 admin-approve.js 가 만들지만 여기서 안전하게 */
  try { await db.prepare(`ALTER TABLE users ADD COLUMN real_name TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'pending'`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN approved_at TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN approved_by TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN name_confirmed INTEGER DEFAULT 0`).run(); } catch {}

  try {
    /* users insert — provider_user_id 는 고유해야 하므로 timestamp 로 생성 */
    const pseudoExternalId = 'admin_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const r = await db.prepare(
      `INSERT INTO users (provider, provider_user_id, name, real_name, phone,
                          approval_status, approved_at, approved_by, name_confirmed,
                          created_at, last_login_at)
       VALUES ('admin_created', ?, ?, ?, ?, 'approved_client', ?, 'admin', 1, ?, NULL)`
    ).bind(pseudoExternalId, displayName || realName, realName, phone || null, now, now).run();
    const userId = r.meta?.last_row_id;
    if (!userId) return Response.json({ error: "user insert failed" }, { status: 500 });

    /* client_businesses 에도 insert (정보 있으면) */
    if (businessNumber || companyName) {
      try {
        await db.prepare(
          `CREATE TABLE IF NOT EXISTS client_businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            company_name TEXT,
            ceo_name TEXT,
            business_number TEXT,
            address TEXT,
            is_primary INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT
          )`
        ).run();
        await db.prepare(
          `INSERT INTO client_businesses (user_id, company_name, ceo_name, business_number, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`
        ).bind(userId, companyName || null, ceoName || null, businessNumber || null, now, now).run();
      } catch {}
    }

    /* 등록 노트가 있으면 '거래처 정보' 메모로 자동 저장 */
    if (notes) {
      try {
        await db.prepare(`CREATE TABLE IF NOT EXISTS memos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT, target_user_id INTEGER,
          author_user_id INTEGER, author_name TEXT,
          assigned_to_user_id INTEGER,
          memo_type TEXT DEFAULT '할 일',
          content TEXT NOT NULL,
          visibility TEXT DEFAULT 'internal',
          is_edited INTEGER DEFAULT 0,
          due_date TEXT, linked_message_id INTEGER,
          filing_type TEXT, filing_period TEXT,
          created_at TEXT, updated_at TEXT, deleted_at TEXT
        )`).run();
        const authorName = auth.name || auth.realName || (auth.owner ? '대표' : '담당자');
        await db.prepare(
          `INSERT INTO memos (target_user_id, author_user_id, author_name, memo_type, content, visibility, created_at, updated_at)
           VALUES (?, ?, ?, '거래처 정보', ?, 'internal', ?, ?)`
        ).bind(userId, auth.userId || null, authorName, notes, now, now).run();
      } catch {}
    }

    return Response.json({ ok: true, user_id: userId });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
