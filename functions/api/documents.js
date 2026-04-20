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

// ============ POST: 업로드 + OCR (또는 ?action=revert_to_photo) ============
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

  // 본인 소유 문서를 사진으로 되돌리기 (잘못 분류된 경우)
  const _url = new URL(context.request.url);
  if (_url.searchParams.get('action') === 'revert_to_photo') {
    try {
      const b = await context.request.json();
      const id = Number(b.id || 0);
      if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
      const doc = await db.prepare(`SELECT id, image_key, status FROM documents WHERE id=? AND user_id=?`)
        .bind(id, user.user_id).first();
      if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
      if (doc.status === 'approved') return Response.json({ error: '이미 승인된 문서는 사진으로 되돌릴 수 없습니다. 세무사에게 요청해주세요.' }, { status: 400 });
      const newContent = '[IMG]/api/image?k=' + encodeURIComponent(doc.image_key);
      await db.prepare(`UPDATE conversations SET content=? WHERE content LIKE ?`)
        .bind(newContent, `[DOC:${id}]%`).run();
      await db.prepare(`UPDATE documents SET status='reverted' WHERE id=?`).bind(id).run();
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: "처리 실패" }, { status: 500 });
    }
  }

  // 영수증 → 파일로 변환 (잘못 받은 영수증을 일반 파일 메시지로)
  if (_url.searchParams.get('action') === 'convert_to_file') {
    try {
      const b = await context.request.json();
      const id = Number(b.id || 0);
      if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
      const doc = await db.prepare(
        `SELECT id, image_key, status, vendor FROM documents WHERE id=? AND user_id=?`
      ).bind(id, user.user_id).first();
      if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
      if (doc.status === 'approved') return Response.json({ error: '이미 승인된 문서는 변환 불가' }, { status: 400 });
      const name = (doc.vendor || 'file') + '.bin';
      const fileUrl = '/api/file?k=' + encodeURIComponent(doc.image_key) + '&name=' + encodeURIComponent(name);
      const meta = JSON.stringify({ url: fileUrl, name, size: 0 });
      await db.prepare(`UPDATE conversations SET content=? WHERE content LIKE ?`)
        .bind(`[FILE]${meta}`, `[DOC:${id}]%`).run();
      await db.prepare(`UPDATE documents SET status='reverted' WHERE id=?`).bind(id).run();
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: "처리 실패" }, { status: 500 });
    }
  }

  // 사진 메시지 → 영수증으로 변환 (OCR 실행)
  // 파일 메시지 → 영수증으로 변환 (PDF 등. OCR 생략, 수동 편집용 doc 생성)
  if (_url.searchParams.get('action') === 'convert_to_receipt') {
    try {
      const b = await context.request.json();
      const messageId = Number(b.message_id || 0);
      const roomId = b.room_id;
      if (!messageId || !roomId) return Response.json({ error: 'message_id, room_id 필요' }, { status: 400 });

      // 멤버십 확인 (IDOR 방어)
      const member = await db.prepare(
        `SELECT 1 FROM room_members WHERE room_id=? AND user_id=? AND left_at IS NULL`
      ).bind(roomId, user.user_id).first();
      if (!member) return Response.json({ error: '권한 없음' }, { status: 403 });

      const msg = await db.prepare(
        `SELECT id, content, user_id FROM conversations WHERE id=? AND room_id=?`
      ).bind(messageId, roomId).first();
      if (!msg) return Response.json({ error: 'message not found' }, { status: 404 });
      if (msg.user_id !== user.user_id) return Response.json({ error: '본인 메시지만 변환 가능' }, { status: 403 });

      // [IMG]/api/image?k=xxx 또는 [FILE]{...} 형태 파싱
      const imgMatch = /^\[IMG\](\/api\/image\?k=([^\s\n]+))/.exec(msg.content || '');
      const fileMatch = /^\[FILE\](\{[^\n]+\})/.exec(msg.content || '');
      let imageKey = null;
      let isFile = false;
      let fileName = null;
      if (imgMatch) {
        imageKey = decodeURIComponent(imgMatch[2]);
      } else if (fileMatch) {
        try {
          const fm = JSON.parse(fileMatch[1]);
          const m2 = /\/api\/file\?k=([^&\s]+)/.exec(fm.url || '');
          if (m2) imageKey = decodeURIComponent(m2[1]);
          fileName = fm.name || null;
          isFile = true;
        } catch {}
      }
      if (!imageKey) return Response.json({ error: '지원 안 되는 메시지 형식' }, { status: 400 });

      // 소유권 검증: R2 키의 prefix가 본인 것이어야 함 (u{user_id}/…)
      if (!imageKey.startsWith(`u${user.user_id}/`) && !imageKey.startsWith('documents/u' + user.user_id + '/')) {
        return Response.json({ error: '본인 업로드 자료만 변환 가능' }, { status: 403 });
      }

      const createdAt = kst();
      const ins = await db.prepare(
        `INSERT INTO documents (user_id, room_id, doc_type, image_key, ocr_status, status, approver_id, approved_at, created_at)
         VALUES (?, ?, 'receipt', ?, 'pending', 'approved', 0, ?, ?)`
      ).bind(user.user_id, roomId, imageKey, createdAt, createdAt).run();
      const docId = ins.meta?.last_row_id;

      // 이미지면 OCR 시도. 파일(PDF 등)은 수동 입력용으로 두고 바로 [DOC] 로 전환.
      if (!isFile) {
        try {
          const obj = await bucket.get(imageKey);
          if (obj) {
            const buf = await obj.arrayBuffer();
            const mime = obj.httpMetadata?.contentType || 'image/jpeg';
            const base64 = arrayBufferToBase64(buf);
            const dataUri = `data:${mime};base64,${base64}`;
            const { visionExtract } = await import('./_vision.js');
            const visionResult = await visionExtract(context.env, dataUri, 'receipt', { model: context.env.OCR_MODEL || 'gpt-4o' });
            if (visionResult.ok && visionResult.parsed) {
              const p = visionResult.parsed;
              const today = ymd();
              let finalDate = p.receipt_date;
              const validDate = /^\d{4}-\d{2}-\d{2}$/.test(finalDate || '');
              if (!validDate) finalDate = today;
              await db.prepare(
                `UPDATE documents SET doc_type=?, ocr_status='ok', ocr_model=?, ocr_raw=?, ocr_confidence=?,
                   vendor=?, vendor_biz_no=?, amount=?, vat_amount=?, receipt_date=?, category=?, category_src='ai',
                   items=?, extra=? WHERE id=?`
              ).bind(
                p.doc_type || 'receipt', visionResult.model, visionResult.raw, p.confidence,
                p.vendor || null, p.vendor_biz_no || null,
                p.amount != null ? p.amount : null, p.vat_amount != null ? p.vat_amount : null,
                finalDate, p.category_guess || null,
                Array.isArray(p.items) ? JSON.stringify(p.items) : null,
                p.extra ? JSON.stringify(p.extra) : null, docId
              ).run();
              try {
                const usage = visionResult.usage || {};
                await db.prepare(
                  `INSERT INTO ocr_usage_log (document_id, user_id, model, prompt_tokens, completion_tokens, cost_cents, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'ok', ?)`
                ).bind(docId, user.user_id, visionResult.model || null,
                  usage.prompt_tokens || 0, usage.completion_tokens || 0,
                  visionResult.cost_cents || 0, createdAt).run();
              } catch {}
            }
          }
        } catch { /* OCR 실패해도 문서 자체는 유지 (수동 편집 가능) */ }
      } else if (fileName) {
        // PDF/파일: OCR 없이 파일명만 vendor 로 저장 (사용자 수동 편집)
        await db.prepare(`UPDATE documents SET vendor=?, receipt_date=? WHERE id=?`)
          .bind(fileName.replace(/\.[^.]+$/,'').slice(0,60), ymd(), docId).run();
      }

      // 메시지 내용 교체
      await db.prepare(`UPDATE conversations SET content=? WHERE id=?`)
        .bind(`[DOC:${docId}]`, messageId).run();

      return Response.json({ ok: true, doc_id: docId });
    } catch (e) {
      return Response.json({ error: "처리 실패" }, { status: 500 });
    }
  }

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
    const skipOcr = form.get('skip_ocr') === '1';
    const extraJson = form.get('extra_json');
    const presetVendor = form.get('vendor');
    const presetAmount = form.get('amount');
    const presetReceiptDate = form.get('receipt_date');

    if (!file || typeof file === 'string') return Response.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ error: '10MB 이하만 업로드 가능합니다' }, { status: 400 });
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(mime)) return Response.json({ error: '이미지 파일만 업로드 가능 (JPEG/PNG/WEBP/GIF/HEIC)' }, { status: 400 });

    // 파일 데이터를 한 번만 읽어서 R2·Vision 양쪽에 재사용
    const buf = await file.arrayBuffer();
    const ext = mime.split('/')[1] || 'bin';
    const rand = Math.random().toString(36).slice(2, 10);
    const key = `documents/u${user.user_id}/${ym()}/${Date.now()}_${rand}.${ext}`;
    await bucket.put(key, buf, {
      httpMetadata: { contentType: mime },
      customMetadata: {
        user_id: String(user.user_id),
        doc_type: docType,
        original_name: file.name || '',
        uploaded_at: kst(),
      }
    });

    // documents insert (초기) — 자동 승인 (세무사가 이상한 것만 수정·반려)
    const createdAt = kst();
    const ins = await db.prepare(
      `INSERT INTO documents (user_id, room_id, doc_type, image_key, ocr_status, status, approver_id, approved_at, created_at)
       VALUES (?, ?, ?, ?, 'pending', 'approved', 0, ?, ?)`
    ).bind(user.user_id, roomId, docType, key, createdAt, createdAt).run();
    const docId = ins.meta?.last_row_id;

    // skip_ocr: 프리랜서 등 수동 입력 — OCR 안 돌리고 preset 값으로 채움
    if (skipOcr) {
      await db.prepare(
        `UPDATE documents SET
           ocr_status = 'ok', ocr_confidence = 1, vendor = ?, amount = ?,
           receipt_date = ?, extra = ?, category = ?, category_src = 'manual'
         WHERE id = ?`
      ).bind(
        presetVendor || null,
        presetAmount ? parseInt(presetAmount, 10) : null,
        presetReceiptDate || null,
        extraJson || null,
        docType === 'freelancer_payment' ? '인건비' : null,
        docId
      ).run();
      const doc = await db.prepare(`SELECT * FROM documents WHERE id=?`).bind(docId).first();
      // 상담방 메시지 삽입
      if (roomId) {
        try {
          const member = await db.prepare(`SELECT 1 FROM room_members WHERE room_id=? AND user_id=? AND left_at IS NULL`).bind(roomId, user.user_id).first();
          if (member) {
            await db.prepare(
              `INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at) VALUES (?, ?, 'user', ?, ?, ?)`
            ).bind('room_' + roomId, user.user_id, `[DOC:${docId}]`, roomId, createdAt).run();
          }
        } catch (e) { console.error('msg insert failed:', e.message); }
      }
      return Response.json({ ok: true, document: doc });
    }

    // OCR 호출 (동기) — R2 put 때 쓴 buf 재사용
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
      // AI 판별 그대로 수용 — confidence 낮아도 AI가 판단한 타입 사용
      // (AI가 정말 모를 때는 자체적으로 'other'로 분류함. 우리가 또 덮지 않음)
      const finalDocType = p.doc_type || docType;

      /* 날짜 검증·fallback — OCR 날짜가 이상하면 업로드일로 대체 */
      const today = ymd();
      let finalDate = p.receipt_date;
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(finalDate || '');
      if (validDate) {
        /* 미래 2일 이후 또는 3년 전보다 오래된 날짜 → 신뢰 X, 업로드일로 대체 */
        const dMs = new Date(finalDate + 'T00:00:00Z').getTime();
        const nowMs = new Date(today + 'T00:00:00Z').getTime();
        const diffDays = (dMs - nowMs) / (24*60*60*1000);
        if (diffDays > 2 || diffDays < -365*3) finalDate = today;
      } else {
        finalDate = today;
      }

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
        finalDate,
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
          // conversations 스키마 매칭: session_id, user_id, role, content, room_id, created_at
          await db.prepare(
            `INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
             VALUES (?, ?, 'user', ?, ?, ?)`
          ).bind(
            'room_' + roomId, user.user_id, `[DOC:${docId}]`, roomId, createdAt
          ).run();
        }
      } catch (e) {
        /* 실패 시 console.error는 Cloudflare Logs에 남음. 문서 자체는 저장됨 */
        console.error('receipt message insert failed:', e.message);
      }
    }

    // 최종 문서 조회 후 반환
    const doc = await db.prepare(`SELECT * FROM documents WHERE id=?`).bind(docId).first();
    return Response.json({ ok: true, document: doc });
  } catch (e) {
    return Response.json({ error: "처리 실패" }, { status: 500 });
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
    /* 세무사(approver_id>0)가 실제로 승인한 이후에만 잠금.
       자동 승인(approver_id=0)은 고객이 금액·가맹점 등 계속 수정 가능 */
    const realApprovedBy = Number(doc.approver_id || 0);
    if (doc.status === 'rejected') return Response.json({ error: '반려된 문서는 수정 불가' }, { status: 400 });
    if (realApprovedBy > 0) return Response.json({ error: '세무사 승인 후에는 수정할 수 없습니다' }, { status: 400 });

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
    return Response.json({ error: "처리 실패" }, { status: 500 });
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
