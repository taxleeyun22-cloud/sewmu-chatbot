// 위하고 일괄 import 시스템 — 롤백 가능 구조 (사장님 명령 2026-05-08)
//
// Endpoints:
// - GET  /api/admin-import-batches?key=ADMIN_KEY     → 모든 batch list (이력)
// - GET  /api/admin-import-batches?id=N              → 단건 상세
// - POST /api/admin-import-batches?action=rollback   → batch 롤백 (owner 만)
//   body: { batch_id: N }
//
// 안전 룰:
// - 메모는 절대 안 건드림 (사장님 명시)
// - 그 batch 의 import_batch_id 채워진 row 만 hard delete
// - enrichment 한 user 는 audit_log 의 before 값으로 복원
// - 다른 batch / 사장님 직접 등록한 데이터 영향 0

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureBatchTable(db) {
  /* 신규 — import_batches 테이블 */
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_uuid TEXT UNIQUE,
      source TEXT,
      source_file TEXT,
      started_at TEXT,
      committed_at TEXT,
      rolled_back_at TEXT,
      status TEXT,
      inserted_users INTEGER DEFAULT 0,
      inserted_businesses INTEGER DEFAULT 0,
      inserted_members INTEGER DEFAULT 0,
      enriched_users INTEGER DEFAULT 0,
      audit_log TEXT,
      preview_data TEXT,
      triggered_by TEXT,
      summary TEXT
    )`).run();
  } catch {}

  /* 기존 테이블에 import_batch_id 컬럼 추가 (lazy migration) */
  const addCol = async (sql) => { try { await db.prepare(sql).run(); } catch {} };
  await addCol(`ALTER TABLE users ADD COLUMN import_batch_id INTEGER`);
  await addCol(`ALTER TABLE businesses ADD COLUMN import_batch_id INTEGER`);
  await addCol(`ALTER TABLE business_members ADD COLUMN import_batch_id INTEGER`);

  /* 사장님 명령 (2026-05-08): 사용자·사업장 dedup 보강 컬럼 */
  await addCol(`ALTER TABLE users ADD COLUMN birth_date TEXT`);                /* 생년월일 YYYY-MM-DD (주민번호 앞 6자리 변환) */
  await addCol(`ALTER TABLE users ADD COLUMN resident_back_hash TEXT`);        /* 주민번호 뒤 7자리 SHA-256 hash (보안 룰 준수) */
  await addCol(`ALTER TABLE businesses ADD COLUMN parent_business_id INTEGER`);/* 본점 ID (NULL=본점, 값=지점) */
  await addCol(`ALTER TABLE businesses ADD COLUMN tax_office TEXT`);           /* 관할 세무서 */
}

export async function onRequestGet(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: "DB error" }, { status: 500 });
  await ensureBatchTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id') || 0);

  if (id) {
    /* 단건 상세 */
    try {
      const batch = await db.prepare(`SELECT * FROM import_batches WHERE id = ?`).bind(id).first();
      if (!batch) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
      return Response.json({ ok: true, batch });
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  /* list — 이력 */
  try {
    const { results } = await db.prepare(
      `SELECT id, batch_uuid, source, source_file, started_at, committed_at, rolled_back_at, status,
              inserted_users, inserted_businesses, inserted_members, enriched_users,
              triggered_by, summary
         FROM import_batches
        ORDER BY id DESC
        LIMIT 100`
    ).all();
    return Response.json({ ok: true, batches: results || [] });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  /* 롤백은 owner only — 가장 위험한 액션 */
  if (!auth.owner) return Response.json({ ok: false, error: 'owner only' }, { status: 403 });

  const db = context.env.DB;
  if (!db) return Response.json({ ok: false, error: "DB error" }, { status: 500 });
  await ensureBatchTable(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';

  let body = {};
  try { body = await context.request.json(); } catch {}

  if (action === 'rollback') {
    const batchId = Number(body.batch_id || 0);
    if (!batchId) return Response.json({ ok: false, error: 'batch_id 필요' }, { status: 400 });

    try {
      const batch = await db.prepare(`SELECT * FROM import_batches WHERE id = ?`).bind(batchId).first();
      if (!batch) return Response.json({ ok: false, error: 'batch not found' }, { status: 404 });
      if (batch.status === 'rolled_back') {
        return Response.json({ ok: false, error: '이미 롤백된 batch' }, { status: 400 });
      }
      /* 사장님 명령 (2026-05-08): preview 상태도 롤백 허용 (비정상 상태 정리용 — INSERT 됐는데 status update 실패한 케이스) */
      if (batch.status !== 'committed' && batch.status !== 'preview') {
        return Response.json({ ok: false, error: 'committed/preview 상태만 롤백 가능 (현재: ' + batch.status + ')' }, { status: 400 });
      }

      const now = kst();
      const stats = { deleted_users: 0, deleted_businesses: 0, deleted_members: 0, restored_users: 0 };

      /* 1. business_members hard delete (FK 충돌 방지 위해 첫 번째) */
      const r1 = await db.prepare(
        `DELETE FROM business_members WHERE import_batch_id = ?`
      ).bind(batchId).run();
      stats.deleted_members = r1?.meta?.changes || 0;

      /* 2. businesses hard delete */
      const r2 = await db.prepare(
        `DELETE FROM businesses WHERE import_batch_id = ?`
      ).bind(batchId).run();
      stats.deleted_businesses = r2?.meta?.changes || 0;

      /* 3. users hard delete */
      const r3 = await db.prepare(
        `DELETE FROM users WHERE import_batch_id = ?`
      ).bind(batchId).run();
      stats.deleted_users = r3?.meta?.changes || 0;

      /* 4. enrichment 한 user 의 before 값 복원 */
      let auditLog = null;
      try { auditLog = JSON.parse(batch.audit_log || '[]'); } catch { auditLog = []; }
      for (const entry of (auditLog || [])) {
        if (entry.type !== 'enrichment' || !entry.user_id || !entry.before) continue;
        const before = entry.before;
        const fields = [];
        const vals = [];
        for (const k of Object.keys(before)) {
          if (['birth_date', 'resident_back_hash', 'phone', 'address', 'name', 'real_name'].includes(k)) {
            fields.push(`${k} = ?`);
            vals.push(before[k] === undefined ? null : before[k]);
          }
        }
        if (fields.length) {
          vals.push(entry.user_id);
          try {
            await db.prepare(
              `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
            ).bind(...vals).run();
            stats.restored_users++;
          } catch {}
        }
      }

      /* 5. batch 상태 갱신 */
      await db.prepare(
        `UPDATE import_batches SET rolled_back_at = ?, status = 'rolled_back' WHERE id = ?`
      ).bind(now, batchId).run();

      return Response.json({
        ok: true,
        batch_id: batchId,
        batch_uuid: batch.batch_uuid,
        rolled_back_at: now,
        stats,
        message: '롤백 완료 — DB 가 batch 직전 상태로 복원됨. 메모는 영향 0.'
      });
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
