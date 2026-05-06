/**
 * Phase #11 (2026-05-06 사장님 명령: 메타 12종 #11 Sentry):
 * 자체 에러 로거 — Cloudflare D1 기반, 외부 서비스 의존 0.
 *
 * Endpoints:
 *   POST /api/admin-error-log    body: { source, message, stack?, url?, ua? }
 *                                → 누구나 (인증 X) — 클라이언트 에러 캡처용
 *                                → rate limit: IP 분당 10건
 *   GET  /api/admin-error-log    ?key=ADMIN_KEY → 최근 200건 (admin only)
 *   DELETE /api/admin-error-log  ?key=ADMIN_KEY → 7일 이전 자동 정리
 *
 * 사용:
 *   - admin.js / index.js 의 window.onerror / unhandledrejection → POST
 *   - admin "에러 로그 보기" 모달 (후속) → GET
 */

import { checkAdmin } from './_adminAuth.js';

const KST_OFFSET = 9 * 60 * 60 * 1000;
function kst() {
  return new Date(Date.now() + KST_OFFSET).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    source TEXT,           -- 'admin' | 'index' | 'business' | 'memo-window' | 'api:xxx'
    message TEXT NOT NULL,
    stack TEXT,
    url TEXT,
    user_agent TEXT,
    user_id INTEGER,        -- (있으면) cookie 세션 user
    ip TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC)`).run(); } catch (_) {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs(source, created_at DESC)`).run(); } catch (_) {}
}

function getIP(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const ip = getIP(context.request);

  /* Rate limit (자체 — 외부 의존 X): 같은 ip 1분 10건 */
  try {
    const r = await db.prepare(
      `SELECT COUNT(*) AS c FROM error_logs WHERE ip = ? AND created_at >= datetime('now', '-1 minute', '+9 hours')`
    ).bind(ip).first();
    if ((r?.c || 0) >= 10) {
      return Response.json({ error: 'too many error reports' }, { status: 429 });
    }
  } catch (_) {}

  const message = String(body.message || '').slice(0, 1000);
  const stack = String(body.stack || '').slice(0, 5000);
  const source = String(body.source || 'unknown').slice(0, 50);
  const url = String(body.url || '').slice(0, 500);
  const ua = String(body.ua || context.request.headers.get('user-agent') || '').slice(0, 300);
  if (!message) return Response.json({ error: 'message required' }, { status: 400 });

  /* 세션 사용자 ID (있으면) */
  let userId = null;
  try {
    const cookie = context.request.headers.get('Cookie') || '';
    const m = cookie.match(/session=([^;]+)/);
    if (m) {
      const row = await db.prepare(
        `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
      ).bind(m[1]).first();
      if (row) userId = row.user_id;
    }
  } catch (_) {}

  try {
    await db.prepare(
      `INSERT INTO error_logs (created_at, source, message, stack, url, user_agent, user_id, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(kst(), source, message, stack, url, ua, userId, ip).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return Response.json({ error: 'unauth' }, { status: 401 });

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const limit = Math.min(500, Number(url.searchParams.get('limit') || 200));
  const sourceFilter = url.searchParams.get('source');

  try {
    let q = `SELECT id, created_at, source, message, stack, url, user_agent, user_id, ip
             FROM error_logs`;
    const binds = [];
    if (sourceFilter) {
      q += ` WHERE source = ?`;
      binds.push(sourceFilter);
    }
    q += ` ORDER BY created_at DESC LIMIT ?`;
    binds.push(limit);
    const { results } = await db.prepare(q).bind(...binds).all();
    return Response.json({ ok: true, errors: results || [], total: (results || []).length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return Response.json({ error: 'unauth' }, { status: 401 });

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const all = url.searchParams.get('all') === '1';
  const source = url.searchParams.get('source');

  try {
    let r;
    if (all) {
      /* 전체 비우기 — owner only (사장님 직접 결정) */
      if (!auth.owner) return Response.json({ error: 'owner only' }, { status: 403 });
      r = await db.prepare(`DELETE FROM error_logs`).run();
    } else if (source) {
      /* 특정 source 만 삭제 — owner only (예: 테스트 데이터 정리) */
      if (!auth.owner) return Response.json({ error: 'owner only' }, { status: 403 });
      r = await db.prepare(`DELETE FROM error_logs WHERE source = ?`).bind(source).run();
    } else {
      /* default: 7일 이전 정리 */
      r = await db.prepare(
        `DELETE FROM error_logs WHERE created_at < datetime('now', '-7 days', '+9 hours')`
      ).run();
    }
    return Response.json({ ok: true, removed: r?.meta?.changes || 0 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
