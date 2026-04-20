// 관리자 액션 감사 로그
// 사용: await logAudit(db, { actor, action, entity_type, entity_id, before, after })

export async function ensureAuditTable(db) {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      before TEXT,
      after TEXT,
      ip TEXT,
      ua TEXT,
      created_at TEXT DEFAULT (datetime('now', '+9 hours'))
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)`).run();
  } catch {}
}

export async function logAudit(db, { actor, action, entity_type, entity_id, before, after, request }) {
  if (!db) return;
  try {
    await ensureAuditTable(db);
    const ip = request?.headers.get('CF-Connecting-IP') || null;
    const ua = request?.headers.get('User-Agent')?.slice(0, 255) || null;
    await db.prepare(
      `INSERT INTO audit_log (actor, action, entity_type, entity_id, before, after, ip, ua)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      actor || 'unknown',
      action || '',
      entity_type || null,
      entity_id || null,
      before == null ? null : (typeof before === 'string' ? before : JSON.stringify(before)),
      after == null ? null : (typeof after === 'string' ? after : JSON.stringify(after)),
      ip, ua
    ).run();
  } catch { /* 감사 실패가 업무 중단시키지 않음 */ }
}
