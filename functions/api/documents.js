// 세무 문서 AI 자동 분류 — 사용자측 API
// - POST /api/documents (multipart: file, room_id?) → R2 저장 + Vision OCR + documents insert + messages insert
// - GET  /api/documents?month=YYYY-MM&status=pending|approved|rejected → 내 문서 목록
// - GET  /api/documents?id=N → 단일 문서 상세
// - PATCH /api/documents (JSON: id, vendor, amount, ...) → OCR 결과 보정 (pending, 본인만)
// - DELETE /api/documents?id=N → 본인 것, pending만
//
// 접근: approved_client 만 허용 (MVP 안전장치)

import { visionExtract } from './_vision.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];

async function getUser(db, request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/session=([^;]+)/);
  if (!m) return null;
  try {
    const row = await db.prepare(
      `SELECT s.user_id, u.real_name, u.name, u.approval_status
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).bind(m[1]).first();
    return row || null;
  } catch { return null; }
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
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
    created_at TEXT
  )`).run();
  // extra JSON 필드 추가 (doc_type별 확장 필드)
  try { await db.prepare(`ALTER TABLE documents ADD COLUMN extra TEXT`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status, created_at DESC)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_documents_pending ON documents(status, created_at DESC)`).run(); } catch {}

  await db.prepare(`CREATE TABLE IF NOT EXISTS ocr_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER,
    user_id INTEGER,
    model TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    cost_cents REAL,
    status TEXT,
    created_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_ocr_usage_created ON ocr_usage_log(created_at DESC)`).run(); } catch {}
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

function ymd() {
  return kst().substring(0, 10);
}

function ym() {
  return kst().substring(0, 7);
}

// ============ POST: 업로드 + OCR ============
export async function onRequestPost(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;
  if (!db || !bucket) return Response.json({ error: 'DB/R2 미설정' }, { status: 500 });

  const user = await getUser(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });
  if (user.approval_status !== 'approved_client') {
    return Response.json({ error: '기장 거래처만 문서 업로드 가능합니다' }, { status: 403 });
  }

  await ensureTables(db);

  // 월 예산 가드 (기본 20만원 = ~$150)
  const monthLimitCents = Number(context.env.OCR_MONTH_LIMIT_CENTS || '15000'); // 150 USD cents 단위
  try {
    const usedRow = await db.prepare(
      `SELECT COALESCE(SUM(cost_cents),0) AS used FROM ocr_usage_log WHERE substr(created_at,1,7) = ?`
    ).bind(ym()).first();
    if ((usedRow?.used || 0) > monthLimitCents) {
      return Response.json({ error: '월 OCR 한도 초과. 세무사에게 문의해주세요.' }, { status: 429 });
    }
  } catch {}

  try {
    const form = await context.request.formData();
    const file = form.get('file');
    const roomId = form.get('room_id') || null;
    const docType = (form.get('doc_type') || 'receipt').toString();

    if (!file || typeof file === 'string') return Response.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ error: '10MB 이하만 업로드 가능합니다' }, { status: 400 });
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(mime)) return Response.json({ error: '이미지 파일만 업로드 가능 (JPEG/PNG/WEBP/GIF/HEIC)' }, { status: 400 });

    // R2 업로드
    const ext = mime.split('/')[1] || 'bin';
    const rand = Math.random().toString(36).slice(2, 10);
    const key = `documents/u${user.user_id}/${ym()}/${Date.now()}_${rand}.${ext}`;
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: mime },
      customMetadata: {
        user_id: String(user.user_id),
        doc_type: docType,
        original_name: file.name || '',
        uploaded_at: kst(),
      }
    });

    // documents insert (초기)
    const createdAt = kst();
    const ins = await db.prepare(
      `INSERT INTO documents (user_id, room_id, doc_type, image_key, ocr_status, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', 'pending', ?)`
    ).bind(user.user_id, roomId, docType, key, createdAt).run();
    const docId = ins.meta?.last_row_id;

    // OCR 호출 (동기)
    // Vision API는 public URL 또는 data URI 필요. 우리 /api/image?k= 는 인증 필요해서 data URI로 보냄
    const buf = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const dataUri = `data:${mime};base64,${base64}`;

    const visionResult = await visionExtract(context.env, dataUri, docType, { model: context.env.OCR_MODEL || 'gpt-4o' });

    // 사용량 로깅
    try {
      await db.prepare(
        `INSERT INTO ocr_usage_log (document_id, user_id, model, prompt_tokens, completion_tokens, cost_cents, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        docId, user.user_id,
        visionResult.model || null,
        visionResult.usage?.prompt_tokens || 0,
        visionResult.usage?.completion_tokens || 0,
        visionResult.cost_cents || 0,
        visionResult.ok ? 'ok' : 'failed',
        createdAt
      ).run();
    } catch {}

    // OCR 결과 반영
    if (visionResult.ok && visionResult.parsed) {
      const p = visionResult.parsed;
      // 저신뢰도(0.5 미만) → 'other' 로 강제, 그 외는 AI 판별 존중
      const finalDocType = (p.confidence < 0.5) ? 'other' : (p.doc_type || docType);

      await db.prepare(
        `UPDATE documents SET
           doc_type = ?,
           ocr_status = 'ok',
           ocr_model = ?,
           ocr_raw = ?,
           ocr_confidence = ?,
           vendor = ?,
           vendor_biz_no = ?,
           amount = ?,
           vat_amount = ?,
           receipt_date = ?,
           category = ?,
           category_src = 'ai',
           items = ?,
           extra = ?
         WHERE id = ?`
      ).bind(
        finalDocType,
        visionResult.model,
        visionResult.raw,
        p.confidence,
        p.vendor || null,
        p.vendor_biz_no || null,
        p.amount != null ? p.amount : null,
        p.vat_amount != null ? p.vat_amount : null,
        p.receipt_date || null,
        p.category_guess || null,
        Array.isArray(p.items) ? JSON.stringify(p.items) : null,
        p.extra ? JSON.stringify(p.extra) : null,
        docId
      ).run();
    } else {
      await db.prepare(`UPDATE documents SET ocr_status='failed', ocr_raw=? WHERE id=?`)
        .bind(visionResult.error || 'unknown', docId).run();
    }

    // 상담방에 자동 메시지 (room_id 있고, 해당 방 멤버일 때만)
    if (roomId) {
      try {
        const member = await db.prepare(
          `SELECT 1 FROM room_members WHERE room_id=? AND user_id=? AND left_at IS NULL`
        ).bind(roomId, user.user_id).first();
        if (member) {
          // message content = [DOC:id] (렌더 시 documents 테이블 조회)
          await db.prepare(
            `INSERT INTO conversations (session_id, user_id, role, content, name, real_name, room_id, created_at)
             VALUES (?, ?, 'user', ?, ?, ?, ?, ?)`
          ).bind(
            'room_' + roomId, user.user_id, `[DOC:${docId}]`,
            user.name || '', user.real_name || '', roomId, createdAt
          ).run();
        }
      } catch (e) { /* 상담방 메시지 실패해도 문서 등록은 성공으로 간주 */ }
    }

    // 최종 문서 조회 후 반환
    const doc = await db.prepare(`SELECT * FROM documents WHERE id=?`).bind(docId).first();
    return Response.json({ ok: true, document: doc });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ============ GET: 목록 or 단일 or alerts ============
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ documents: [] });
  const user = await getUser(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  if (action === 'alerts') {
    // 내 다가오는 D-day 알림
    const days = parseInt(url.searchParams.get('days') || '60', 10);
    const today = kst().substring(0, 10);
    const future = new Date(Date.now() + 9*60*60*1000 + days*24*60*60*1000)
      .toISOString().substring(0, 10);
    try { await db.prepare(`CREATE TABLE IF NOT EXISTS document_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_doc_id INTEGER, user_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL, trigger_date TEXT NOT NULL, lead_days INTEGER DEFAULT 0,
      title TEXT, message TEXT, status TEXT DEFAULT 'pending',
      sent_at TEXT, dismissed_at TEXT, created_at TEXT
    )`).run(); } catch {}
    const rows = await db.prepare(
      `SELECT id, source_doc_id, alert_type, trigger_date, lead_days, title, message, status, sent_at
       FROM document_alerts
       WHERE user_id = ? AND status IN ('pending','sent')
         AND trigger_date >= date(?, '-7 days')
         AND trigger_date <= ?
       ORDER BY trigger_date ASC LIMIT 50`
    ).bind(user.user_id, today, future).all();
    return Response.json({ today, alerts: rows.results || [] });
  }

  const id = url.searchParams.get('id');
  if (id) {
    const doc = await db.prepare(`SELECT * FROM documents WHERE id=? AND user_id=?`).bind(id, user.user_id).first();
    if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ document: doc });
  }

  const month = url.searchParams.get('month'); // YYYY-MM
  const status = url.searchParams.get('status');
  const clauses = ['user_id = ?'];
  const args = [user.user_id];
  if (month) { clauses.push(`substr(created_at,1,7) = ?`); args.push(month); }
  if (status && ['pending','approved','rejected'].includes(status)) {
    clauses.push(`status = ?`);
    args.push(status);
  }
  const rows = await db.prepare(
    `SELECT id, doc_type, ocr_status, vendor, amount, receipt_date, category, status, created_at
     FROM documents WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC LIMIT 200`
  ).bind(...args).all();
  return Response.json({ documents: rows.results || [] });
}

// ============ PATCH: OCR 결과 보정 (pending, 본인만) ============
export async function onRequestPatch(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  const user = await getUser(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });

  try {
    const body = await context.request.json();
    const id = body.id;
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });

    const doc = await db.prepare(`SELECT * FROM documents WHERE id=? AND user_id=?`).bind(id, user.user_id).first();
    if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
    if (doc.status !== 'pending') return Response.json({ error: '승인·반려된 문서는 수정 불가' }, { status: 400 });

    const fields = ['vendor','vendor_biz_no','amount','vat_amount','receipt_date','category','note','doc_type'];
    const sets = [];
    const args = [];
    for (const f of fields) {
      if (body[f] !== undefined) {
        sets.push(`${f} = ?`);
        args.push(body[f]);
      }
    }
    if (body.category !== undefined) {
      sets.push(`category_src = 'manual'`);
    }
    if (!sets.length) return Response.json({ ok: true, updated: 0 });

    args.push(id);
    await db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ============ DELETE: pending, 본인만 ============
export async function onRequestDelete(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  const user = await getUser(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });

  const doc = await db.prepare(`SELECT * FROM documents WHERE id=? AND user_id=?`).bind(id, user.user_id).first();
  if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
  if (doc.status !== 'pending') return Response.json({ error: 'pending만 삭제 가능' }, { status: 400 });

  await db.prepare(`DELETE FROM documents WHERE id=?`).bind(id).run();
  // R2 원본은 감사용으로 유지 (30일 후 배치에서 파기 예정)
  return Response.json({ ok: true });
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
