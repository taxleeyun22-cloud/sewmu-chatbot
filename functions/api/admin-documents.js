// 세무 문서 AI 자동 분류 — 세무사(관리자)측 API
// - GET  /api/admin-documents?key=&status=&user_id=&from=&to=&month= → 문서 목록
// - GET  /api/admin-documents?key=&id=N → 단일 문서 상세
// - POST /api/admin-documents?key=&action=approve  body: {id, category?, note?}
// - POST /api/admin-documents?key=&action=reject   body: {id, reason, note?}
// - GET  /api/admin-documents?key=&action=stats&month=YYYY-MM → 비용·건수 집계

import { checkAdmin, adminUnauthorized } from './_adminAuth.js';

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureTables(db) {
  // documents.js와 동일한 스키마. 혹시 먼저 호출돼도 문제없게.
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
  await db.prepare(`CREATE TABLE IF NOT EXISTS document_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_doc_id INTEGER,
    user_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    trigger_date TEXT NOT NULL,
    lead_days INTEGER DEFAULT 0,
    title TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    dismissed_at TEXT,
    created_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_alerts_trigger ON document_alerts(status, trigger_date)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_alerts_user ON document_alerts(user_id, status, trigger_date)`).run(); } catch {}
}

// 승인 시 문서 타입별 D-day 알림 자동 생성
async function createAlertsForDocument(db, doc) {
  const now = kst();
  const ex = safeJsonParse(doc.extra) || {};
  const inserts = [];

  // 공통 헬퍼
  const push = (alert_type, trigger_date, lead_days, title, message) => {
    if (!trigger_date || !/^\d{4}-\d{2}-\d{2}$/.test(trigger_date)) return;
    inserts.push({ alert_type, trigger_date, lead_days, title, message });
  };

  switch (doc.doc_type) {
    case 'lease': {
      if (ex.end_date) {
        push('contract_expire_30', ex.end_date, 30, '임대차 계약 만료 30일 전',
             `${ex.property_address || '물건지'} 계약 만료 30일 전. 갱신·해지 검토 필요.`);
        push('contract_expire', ex.end_date, 0, '임대차 계약 만료일',
             `${ex.property_address || '물건지'} 계약이 오늘 만료됩니다.`);
        // 보증금 반환 기한 (계약 만료 후 30일)
        const dd = new Date(ex.end_date + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() + 30);
        push('deposit_return', dd.toISOString().substring(0,10), 0, '보증금 반환 기한',
             `${ex.property_address || ''} 보증금 반환 기한(계약 만료 후 30일).`);
      }
      break;
    }
    case 'insurance': {
      if (ex.end_date) {
        push('insurance_expire_30', ex.end_date, 30, '보험 만기 30일 전',
             `${ex.insurer || ''} ${ex.insurance_type || ''} 만기 30일 전. 갱신 검토.`);
        push('insurance_expire', ex.end_date, 0, '보험 만기일',
             `${ex.insurer || ''} ${ex.insurance_type || ''} 만기일.`);
      }
      break;
    }
    case 'utility': {
      if (ex.due_date) {
        push('payment_due_3', ex.due_date, 3, '공과금 납부 3일 전',
             `${ex.utility_type || ''} 요금 납부 기한 3일 전. 금액 ${(doc.amount||0).toLocaleString('ko-KR')}원.`);
        push('payment_due', ex.due_date, 0, '공과금 납부 기한',
             `${ex.utility_type || ''} 요금 납부일.`);
      }
      break;
    }
    case 'property_tax': {
      if (ex.due_date) {
        push('tax_due_3', ex.due_date, 3, '지방세 납부 3일 전',
             `${ex.tax_name || '지방세'} 납부 3일 전. 금액 ${(doc.amount||0).toLocaleString('ko-KR')}원.`);
        push('tax_due', ex.due_date, 0, '지방세 납부 기한',
             `${ex.tax_name || '지방세'} 납부일.`);
      }
      break;
    }
    case 'tax_invoice': {
      // 세금계산서 발행일 속한 분기 부가세 신고 기한 (대략 다음달 25일)
      if (doc.receipt_date) {
        const d = new Date(doc.receipt_date + 'T00:00:00Z');
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth(); // 0-11
        let filingDate;
        // 1기(1-6월) → 7/25, 2기(7-12월) → 1/25
        if (m <= 5) filingDate = `${y}-07-25`;
        else filingDate = `${y+1}-01-25`;
        push('vat_filing_7', filingDate, 7, '부가세 신고 7일 전',
             `세금계산서 관련 부가세 신고 기한 7일 전 (${filingDate}).`);
      }
      break;
    }
    case 'payroll': {
      // 원천세 신고 매월 10일 (다음달)
      if (ex.start_date) {
        // 이번 달 원천세는 다음 달 10일
        const d = new Date();
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth();
        const nextMonth = m === 11 ? 0 : m + 1;
        const nextY = m === 11 ? y + 1 : y;
        const filingDate = `${nextY}-${String(nextMonth+1).padStart(2,'0')}-10`;
        push('withholding_due_3', filingDate, 3, '원천세 신고 3일 전',
             `근로계약 발생. 다음 달 원천세 신고 기한 3일 전.`);
      }
      break;
    }
  }

  for (const a of inserts) {
    try {
      await db.prepare(
        `INSERT INTO document_alerts (source_doc_id, user_id, alert_type, trigger_date, lead_days, title, message, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(doc.id, doc.user_id, a.alert_type, a.trigger_date, a.lead_days, a.title, a.message, now).run();
    } catch (e) { /* 중복 등 무시 */ }
  }
  return inserts.length;
}

function safeJsonParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// ============ GET ============
export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');

  if (action === 'stats') return await getStats(db, url);
  if (action === 'export') return await exportDocs(db, url);
  if (action === 'alerts') return await getAlerts(db, url);
  if (action === 'by_user') return await getByUser(db, url);
  if (action === 'health_check') return await healthCheck(context);

  const id = url.searchParams.get('id');
  if (id) {
    const doc = await db.prepare(
      `SELECT d.*, u.real_name, u.name
       FROM documents d LEFT JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`
    ).bind(id).first();
    if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ document: doc });
  }

  const status = url.searchParams.get('status');   // pending|approved|rejected
  const userId = url.searchParams.get('user_id');
  const month = url.searchParams.get('month');     // YYYY-MM
  const from = url.searchParams.get('from');       // YYYY-MM-DD
  const to = url.searchParams.get('to');
  const docType = url.searchParams.get('doc_type');
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10));

  const clauses = ['1=1'];
  const args = [];
  if (status && ['pending','approved','rejected'].includes(status)) { clauses.push('d.status = ?'); args.push(status); }
  if (userId) { clauses.push('d.user_id = ?'); args.push(userId); }
  if (month) { clauses.push(`substr(d.created_at,1,7) = ?`); args.push(month); }
  if (from) { clauses.push(`substr(d.created_at,1,10) >= ?`); args.push(from); }
  if (to) { clauses.push(`substr(d.created_at,1,10) <= ?`); args.push(to); }
  if (docType) { clauses.push('d.doc_type = ?'); args.push(docType); }

  const rows = await db.prepare(
    `SELECT d.id, d.user_id, d.room_id, d.doc_type, d.ocr_status, d.ocr_confidence,
            d.vendor, d.vendor_biz_no, d.amount, d.vat_amount, d.receipt_date,
            d.category, d.category_src, d.status, d.approved_at, d.created_at, d.image_key,
            u.real_name, u.name
     FROM documents d LEFT JOIN users u ON d.user_id = u.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY d.created_at DESC LIMIT ?`
  ).bind(...args, limit).all();

  // 카운트 (상태별)
  const counts = {};
  try {
    const cnt = await db.prepare(
      `SELECT status, COUNT(*) AS c FROM documents GROUP BY status`
    ).all();
    (cnt.results || []).forEach(r => counts[r.status] = r.c);
  } catch {}

  return Response.json({ documents: rows.results || [], counts });
}

// ============ CSV export ============
// 위하고(Wehago) 전표 표준 레이아웃 (더존 Smart A 계열 호환)
// 컬럼: 일자 | 구분(1차변/2대변) | 계정코드 | 계정과목 | 거래처 | 적요 | 차변 | 대변 | 증빙구분
//
// 카테고리 → 위하고 계정코드 매핑 (초안 — 세무사 재확인 필요)
const WEHAGO_ACCOUNT = {
  '식비':       { code: '811', name: '복리후생비' },
  '교통비':     { code: '812', name: '여비교통비' },
  '숙박비':     { code: '812', name: '여비교통비' },
  '접대비':     { code: '813', name: '기업업무추진비' },
  '통신비':     { code: '814', name: '통신비' },
  '공과금':     { code: '815', name: '수도광열비' },
  '임대료':     { code: '819', name: '임차료' },
  '소모품비':   { code: '830', name: '소모품비' },
  '보험료':     { code: '821', name: '보험료' },
  '기타':       { code: '999', name: '미결산계정' },
};
// 증빙 구분: 1=세금계산서, 2=계산서, 3=영수증/카드, 4=현금영수증
const EVIDENCE_BY_TYPE = {
  receipt: '3', tax_invoice: '1', lease: '3', insurance: '3',
  utility: '3', property_tax: '3', payroll: '3', other: '3',
};

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function exportDocs(db, url) {
  const format = url.searchParams.get('format') || 'wehago';
  const month = url.searchParams.get('month') || kst().substring(0, 7);
  const userId = url.searchParams.get('user_id');

  const clauses = [`status = 'approved'`, `substr(created_at,1,7) = ?`];
  const args = [month];
  if (userId) { clauses.push('user_id = ?'); args.push(userId); }

  const { results: docs } = await db.prepare(
    `SELECT d.*, u.real_name, u.name FROM documents d
     LEFT JOIN users u ON d.user_id = u.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY d.receipt_date, d.created_at`
  ).bind(...args).all();

  if (format === 'wehago') {
    const header = ['일자','구분','계정코드','계정과목','거래처','적요','차변','대변','증빙구분'];
    const lines = [header.map(csvEscape).join(',')];
    let rowNo = 0;
    for (const d of (docs || [])) {
      if (d.amount == null || d.amount <= 0) continue;
      const date = (d.receipt_date || d.created_at || '').replace(/-/g, '').substring(0, 8);
      const vendor = d.vendor || '';
      const category = d.category || '기타';
      const acct = WEHAGO_ACCOUNT[category] || WEHAGO_ACCOUNT['기타'];
      const evidence = EVIDENCE_BY_TYPE[d.doc_type] || '3';
      const desc = `${docTypeShort(d.doc_type)}${d.note ? ' - ' + d.note : ''}`;
      // 차변 (비용 계정)
      lines.push([date, '1', acct.code, acct.name, vendor, desc, d.amount, 0, evidence].map(csvEscape).join(','));
      // 대변 (미지급금 기본)
      lines.push([date, '2', '253', '미지급금', vendor, desc, 0, d.amount, evidence].map(csvEscape).join(','));
      rowNo += 2;
    }
    // Excel이 UTF-8 CSV를 깨는 이슈 대응 → BOM 추가
    const csv = '\uFEFF' + lines.join('\r\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="wehago_${month}${userId ? '_u' + userId : ''}.csv"`,
      },
    });
  }

  // format=simple — 단순 목록 CSV
  const header = ['일자','타입','고객','가맹점','금액','부가세','카테고리','상태','메모'];
  const lines = [header.map(csvEscape).join(',')];
  for (const d of (docs || [])) {
    lines.push([
      d.receipt_date || (d.created_at || '').substring(0, 10),
      d.doc_type,
      d.real_name || d.name || '#' + d.user_id,
      d.vendor || '',
      d.amount || 0,
      d.vat_amount || 0,
      d.category || '',
      d.status,
      d.note || '',
    ].map(csvEscape).join(','));
  }
  const csv = '\uFEFF' + lines.join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="documents_${month}.csv"`,
    },
  });
}

function docTypeShort(t) {
  const map = { receipt: '영수증', tax_invoice: '세계산서', lease: '임대차', insurance: '보험', utility: '공과금', property_tax: '지방세', payroll: '급여', bank_stmt: '은행내역', business_reg: '사업자등록', identity: '신분증', contract: '계약', other: '기타' };
  return map[t] || t || '기타';
}

// ============ R2 파일 손상 점검 ============
// 초기 버그(file.stream 중복 소비)로 R2에 빈 파일 저장된 documents 찾기·처리
async function healthCheck(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;
  if (!db || !bucket) return Response.json({ error: 'no_db_or_bucket' }, { status: 500 });
  const url = new URL(context.request.url);
  const doFix = url.searchParams.get('fix') === '1';

  // 최근 30일 pending/approved 문서만 스캔 (이전 건은 성능상 제외)
  const { results: docs } = await db.prepare(
    `SELECT id, user_id, image_key, status, created_at FROM documents
     WHERE status IN ('pending','approved') AND datetime(created_at) > datetime('now','-30 days')
     ORDER BY created_at DESC LIMIT 500`
  ).all();

  const broken = [];
  for (const d of (docs || [])) {
    try {
      const head = await bucket.head(d.image_key);
      if (!head || !head.size) {
        broken.push({ id: d.id, user_id: d.user_id, image_key: d.image_key, created_at: d.created_at, size: head?.size||0 });
      }
    } catch (e) {
      broken.push({ id: d.id, user_id: d.user_id, image_key: d.image_key, created_at: d.created_at, error: e.message });
    }
  }

  let fixed = 0;
  if (doFix && broken.length) {
    for (const b of broken) {
      try {
        await db.prepare(
          `UPDATE documents SET status='rejected', reject_reason='원본 파일 손상 — 같은 영수증 다시 업로드해 주세요 (시스템 문제)', approved_at=? WHERE id=?`
        ).bind(kst(), b.id).run();

        // 상담방에 안내 메시지 (문서가 상담방 연결돼있으면)
        const doc = await db.prepare(`SELECT room_id FROM documents WHERE id=?`).bind(b.id).first();
        if (doc?.room_id) {
          const alertContent = `[ALERT]${JSON.stringify({
            t: '⚠️ 영수증 재업로드 요청',
            m: '업로드 과정 문제로 원본 파일이 손상됐어요. 같은 영수증을 다시 올려주시면 처리해 드립니다.',
            d: kst().substring(0,10),
            at: 'broken_image'
          })}`;
          await db.prepare(
            `INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
             VALUES (?, NULL, 'assistant', ?, ?, ?)`
          ).bind('room_'+doc.room_id, alertContent, doc.room_id, kst()).run();
        }
        fixed++;
      } catch (e) { /* continue */ }
    }
  }

  return Response.json({
    scanned: (docs || []).length,
    broken: broken.length,
    fixed,
    broken_list: broken.slice(0, 50),
  });
}

// ============ 거래처별 요약 ============
// 각 user에 대해: 총 문서수, 대기수, 이번달 문서수·금액합, 마지막 업로드 시각
// 대상: approved_client + (문서가 1건이라도 있는 사용자)
async function getByUser(db, url) {
  const thisMonth = kst().substring(0, 7);
  // 1) 문서가 있는 사용자 집계
  const { results: docAgg } = await db.prepare(
    `SELECT d.user_id,
            COUNT(*) AS total,
            SUM(CASE WHEN d.status='pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN d.status='approved' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN d.status='rejected' THEN 1 ELSE 0 END) AS rejected,
            SUM(CASE WHEN substr(d.created_at,1,7) = ? THEN 1 ELSE 0 END) AS month_count,
            SUM(CASE WHEN substr(d.created_at,1,7) = ? AND d.status='approved' THEN d.amount ELSE 0 END) AS month_approved_amount,
            MAX(d.created_at) AS last_upload
     FROM documents d
     GROUP BY d.user_id`
  ).bind(thisMonth, thisMonth).all();

  // 2) users 테이블과 조인하여 이름 붙이기 + approved_client 전체도 포함 (문서 0건이어도 표시)
  const userIds = (docAgg || []).map(r => r.user_id);
  const userMap = {};
  for (const r of (docAgg || [])) userMap[r.user_id] = r;

  // 사업체·대표자: 거래처별 첫 번째(primary 우선) business
  let bizByUser = {};
  try {
    const { results: bizs } = await db.prepare(
      `SELECT user_id, company_name, ceo_name, business_number, is_primary
       FROM client_businesses
       ORDER BY user_id, is_primary DESC, id ASC`
    ).all();
    for (const b of (bizs || [])) {
      if (!bizByUser[b.user_id]) bizByUser[b.user_id] = b; // 첫 번째만 (primary 우선 정렬됨)
    }
  } catch {}

  const { results: clients } = await db.prepare(
    `SELECT id, real_name, name, phone, approval_status
     FROM users
     WHERE approval_status = 'approved_client'
     ORDER BY COALESCE(real_name, name)`
  ).all();

  const list = [];
  for (const u of (clients || [])) {
    const agg = userMap[u.id] || {};
    const biz = bizByUser[u.id] || null;
    list.push({
      user_id: u.id,
      real_name: u.real_name || null,
      name: u.name || null,
      phone: u.phone || null,
      /* 사업체 정보 (등록된 것 우선, 없으면 null) */
      company_name: biz?.company_name || null,
      ceo_name: biz?.ceo_name || null,
      business_number: biz?.business_number || null,
      total: agg.total || 0,
      pending: agg.pending || 0,
      approved: agg.approved || 0,
      rejected: agg.rejected || 0,
      month_count: agg.month_count || 0,
      month_approved_amount: agg.month_approved_amount || 0,
      last_upload: agg.last_upload || null,
    });
  }

  // 정렬: 대기건수 내림차순 → 마지막 업로드 최신순
  list.sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    if ((b.last_upload || '') !== (a.last_upload || '')) return (b.last_upload || '') < (a.last_upload || '') ? -1 : 1;
    return (a.real_name || a.name || '').localeCompare(b.real_name || b.name || '');
  });

  // 문서는 있지만 approved_client가 아닌 사용자도 포함 (예: 이전 승인 후 상태 변경)
  const includedIds = new Set(list.map(x => x.user_id));
  for (const r of (docAgg || [])) {
    if (includedIds.has(r.user_id)) continue;
    // 해당 user 정보 단건 조회
    try {
      const u = await db.prepare(`SELECT id, real_name, name, phone, approval_status FROM users WHERE id = ?`).bind(r.user_id).first();
      if (u) {
        const biz = bizByUser[u.id] || null;
        list.push({
          user_id: u.id,
          real_name: u.real_name || null,
          name: u.name || null,
          phone: u.phone || null,
          company_name: biz?.company_name || null,
          ceo_name: biz?.ceo_name || null,
          business_number: biz?.business_number || null,
          total: r.total || 0,
          pending: r.pending || 0,
          approved: r.approved || 0,
          rejected: r.rejected || 0,
          month_count: r.month_count || 0,
          month_approved_amount: r.month_approved_amount || 0,
          last_upload: r.last_upload || null,
          approval_status: u.approval_status,
          _non_client: u.approval_status !== 'approved_client',
        });
      }
    } catch {}
  }

  return Response.json({ this_month: thisMonth, users: list });
}

// ============ Alerts (다가오는 D-day 일정) ============
async function getAlerts(db, url) {
  const days = parseInt(url.searchParams.get('days') || '60', 10); // 향후 N일
  const today = kst().substring(0, 10);
  const future = new Date(Date.now() + 9*60*60*1000 + days*24*60*60*1000)
    .toISOString().substring(0, 10);

  const rows = await db.prepare(
    `SELECT a.id, a.source_doc_id, a.user_id, a.alert_type, a.trigger_date, a.lead_days,
            a.title, a.message, a.status, a.sent_at, a.created_at,
            u.real_name, u.name,
            d.doc_type, d.vendor, d.amount, d.receipt_date
     FROM document_alerts a
     LEFT JOIN users u ON a.user_id = u.id
     LEFT JOIN documents d ON a.source_doc_id = d.id
     WHERE a.status = 'pending'
       AND a.trigger_date >= ?
       AND a.trigger_date <= ?
     ORDER BY a.trigger_date ASC
     LIMIT 200`
  ).bind(today, future).all();

  return Response.json({ today, until: future, alerts: rows.results || [] });
}

async function getStats(db, url) {
  const month = url.searchParams.get('month') || kst().substring(0, 7);

  // OCR 호출수·비용
  const usage = await db.prepare(
    `SELECT
       COUNT(*) AS calls,
       SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok,
       SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
       COALESCE(SUM(cost_cents), 0) AS cost_cents
     FROM ocr_usage_log
     WHERE substr(created_at,1,7) = ?`
  ).bind(month).first();

  // 문서 상태별
  const byStatus = await db.prepare(
    `SELECT status, COUNT(*) AS c FROM documents WHERE substr(created_at,1,7) = ? GROUP BY status`
  ).bind(month).all();

  // 타입별
  const byType = await db.prepare(
    `SELECT doc_type, COUNT(*) AS c FROM documents WHERE substr(created_at,1,7) = ? GROUP BY doc_type`
  ).bind(month).all();

  // 카테고리별 (금액 합)
  const byCategory = await db.prepare(
    `SELECT COALESCE(category,'(미분류)') AS category, COUNT(*) AS c, COALESCE(SUM(amount),0) AS total
     FROM documents WHERE substr(created_at,1,7) = ? AND status='approved' GROUP BY category
     ORDER BY total DESC`
  ).bind(month).all();

  // 고객별
  const byUser = await db.prepare(
    `SELECT d.user_id, u.real_name, u.name, COUNT(*) AS c, COALESCE(SUM(d.amount),0) AS total
     FROM documents d LEFT JOIN users u ON d.user_id = u.id
     WHERE substr(d.created_at,1,7) = ?
     GROUP BY d.user_id ORDER BY c DESC LIMIT 50`
  ).bind(month).all();

  return Response.json({
    month,
    usage: {
      calls: usage.calls || 0,
      ok: usage.ok || 0,
      failed: usage.failed || 0,
      cost_cents: Math.round((usage.cost_cents || 0) * 100) / 100,
      cost_krw: Math.round((usage.cost_cents || 0) * 14), // 1센트 ≈ 14원 (환율·환차 대충)
    },
    by_status: Object.fromEntries((byStatus.results || []).map(r => [r.status, r.c])),
    by_type: Object.fromEntries((byType.results || []).map(r => [r.doc_type, r.c])),
    by_category: byCategory.results || [],
    by_user: byUser.results || [],
  });
}

// ============ POST: 승인·반려·일괄처리 ============
export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });
  await ensureTables(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const body = await context.request.json().catch(() => ({}));
  const approverId = auth.userId || 0; // owner는 0 (ADMIN_KEY)

  if (action === 'approve') {
    const { id, category, note, vendor, amount, vat_amount, receipt_date } = body;
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });

    // 선택적으로 필드 수정 병행
    const sets = ['status = ?', 'approver_id = ?', 'approved_at = ?'];
    const args = ['approved', approverId, kst()];
    if (category !== undefined) { sets.push('category = ?', "category_src = 'manual'"); args.push(category); }
    if (note !== undefined) { sets.push('note = ?'); args.push(note); }
    if (vendor !== undefined) { sets.push('vendor = ?'); args.push(vendor); }
    if (amount !== undefined) { sets.push('amount = ?'); args.push(amount); }
    if (vat_amount !== undefined) { sets.push('vat_amount = ?'); args.push(vat_amount); }
    if (receipt_date !== undefined) { sets.push('receipt_date = ?'); args.push(receipt_date); }
    args.push(id);

    await db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    // 승인된 문서의 alerts 자동 생성
    let alertCount = 0;
    try {
      const doc = await db.prepare(`SELECT * FROM documents WHERE id = ?`).bind(id).first();
      if (doc) alertCount = await createAlertsForDocument(db, doc);
    } catch {}
    return Response.json({ ok: true, alerts_created: alertCount });
  }

  if (action === 'reject') {
    const { id, reason, note } = body;
    if (!id || !reason) return Response.json({ error: 'id/reason 필요' }, { status: 400 });
    const args = ['rejected', approverId, kst(), reason, note || null, id];
    await db.prepare(
      `UPDATE documents SET status = ?, approver_id = ?, approved_at = ?, reject_reason = ?, note = ? WHERE id = ?`
    ).bind(...args).run();
    return Response.json({ ok: true });
  }

  if (action === 'bulk_approve') {
    const { ids } = body;
    if (!Array.isArray(ids) || !ids.length) return Response.json({ error: 'ids 배열 필요' }, { status: 400 });
    const at = kst();
    for (const id of ids) {
      await db.prepare(
        `UPDATE documents SET status='approved', approver_id=?, approved_at=? WHERE id=? AND status='pending'`
      ).bind(approverId, at, id).run();
    }
    return Response.json({ ok: true, count: ids.length });
  }

  if (action === 'revert') {
    /* 승인 취소 — pending 으로 되돌리고 편집 가능 상태로 */
    const { id } = body;
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
    await db.prepare(
      `UPDATE documents SET status = 'pending', approver_id = NULL, approved_at = NULL WHERE id = ?`
    ).bind(id).run();
    return Response.json({ ok: true });
  }

  if (action === 'revert_to_photo') {
    /* 문서로 잘못 분류된 것을 일반 사진으로 되돌리기:
       - 해당 [DOC:id] 메시지를 [IMG]/api/image?k=... 로 변경
       - documents 행은 status='reverted'로 마킹 (감사 기록 보존, 화면에서 제외) */
    const { id } = body;
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
    const doc = await db.prepare(`SELECT id, image_key FROM documents WHERE id = ?`).bind(id).first();
    if (!doc) return Response.json({ error: '문서 없음' }, { status: 404 });
    const newContent = '[IMG]/api/image?k=' + encodeURIComponent(doc.image_key);
    await db.prepare(`UPDATE conversations SET content = ? WHERE content LIKE ?`)
      .bind(newContent, `[DOC:${id}]%`).run();
    await db.prepare(`UPDATE documents SET status = 'reverted', approver_id = ?, approved_at = ? WHERE id = ?`)
      .bind(approverId, kst(), id).run();
    return Response.json({ ok: true });
  }

  if (action === 'dismiss_alert') {
    const { id } = body;
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
    await db.prepare(
      `UPDATE document_alerts SET status = 'dismissed', dismissed_at = ? WHERE id = ?`
    ).bind(kst(), id).run();
    return Response.json({ ok: true });
  }

  if (action === 'update') {
    // 세무사가 문서 필드 수정 (승인 여부와 무관)
    const { id } = body;
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 });
    const fields = ['vendor','vendor_biz_no','amount','vat_amount','receipt_date','category','note','doc_type'];
    const sets = [];
    const args = [];
    for (const f of fields) {
      if (body[f] !== undefined) {
        sets.push(`${f} = ?`);
        args.push(body[f]);
      }
    }
    if (body.category !== undefined) sets.push(`category_src = 'manual'`);
    // extra JSON 패치 (lease.deposit, insurance.premium 등)
    if (body.extra_patch && typeof body.extra_patch === 'object') {
      const cur = await db.prepare(`SELECT extra FROM documents WHERE id = ?`).bind(id).first();
      let ex = {};
      try { ex = cur?.extra ? JSON.parse(cur.extra) : {}; } catch {}
      Object.assign(ex, body.extra_patch);
      sets.push('extra = ?');
      args.push(JSON.stringify(ex));
    }
    if (!sets.length) return Response.json({ ok: true, updated: 0 });
    args.push(id);
    await db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
