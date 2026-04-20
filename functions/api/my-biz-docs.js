// 사업장별 필수 서류 관리 — 기장 거래처 온보딩
// 서류: 신분증(id_card), 사업자등록증(biz_reg), 홈택스 계정(hometax_id/password)
//
// - GET  /api/my-biz-docs                  → 내 사업장별 서류 현황 (대표 본인 사업장만)
// - POST /api/my-biz-docs (JSON)           → 홈택스 계정 저장
//   body: { business_id, hometax_id, hometax_password }
// - POST /api/my-biz-docs?action=upload (multipart) → 신분증·사업자등록증 이미지 업로드
//   form: { business_id, kind: 'id_card'|'biz_reg', file }
// - DELETE /api/my-biz-docs?business_id=X&kind=... → 파일 삭제
//
// 보안:
// - 이미지: R2 프라이빗. 키 패턴 biz_docs/{user_id}/{business_id}/{kind}.{ext}
// - 홈택스 비번: base64 저장 (✱ 운영 시 AES-GCM로 업그레이드 필요, 현재는 DB 접근권 있는 세무사만 복호화)
// - 세무사(관리자)가 admin-biz-docs.js 통해 조회

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'];

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

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS biz_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL,
    id_card_key TEXT,
    id_card_uploaded_at TEXT,
    biz_reg_key TEXT,
    biz_reg_uploaded_at TEXT,
    hometax_id TEXT,
    hometax_password_enc TEXT,
    hometax_updated_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(user_id, business_id)
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_biz_docs_user ON biz_docs(user_id)`).run(); } catch {}
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

// 본인이 대표인 사업장만 필터 (user.real_name === ceo_name)
function isOwner(user, biz) {
  if (!biz) return false;
  if (!biz.ceo_name) return true; /* 대표자명 없으면 기본 true (나중에 채움) */
  const u = (user.real_name || user.name || '').trim();
  const c = (biz.ceo_name || '').trim();
  return u === c;
}

function toBase64(s) {
  try { return btoa(unescape(encodeURIComponent(s))); } catch { return ''; }
}

// ============ GET: 내 사업장별 서류 현황 ============
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ businesses: [] });

  const user = await getUser(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });
  if (user.approval_status !== 'approved_client') {
    return Response.json({ businesses: [], only_client: true });
  }

  await ensureTable(db);

  // 내 사업장 전체
  const { results: bizRows } = await db.prepare(
    `SELECT id, company_name, ceo_name, business_number, address, is_primary
     FROM client_businesses WHERE user_id = ? ORDER BY is_primary DESC, id ASC`
  ).bind(user.user_id).all();

  const { results: docRows } = await db.prepare(
    `SELECT business_id, id_card_key, id_card_uploaded_at,
            biz_reg_key, biz_reg_uploaded_at, hometax_id, hometax_updated_at
     FROM biz_docs WHERE user_id = ?`
  ).bind(user.user_id).all();
  const docsByBiz = {};
  (docRows || []).forEach(d => docsByBiz[d.business_id] = d);

  const businesses = (bizRows || []).map(b => {
    const owner = isOwner(user, b);
    const d = docsByBiz[b.id] || {};
    const hasIdCard = !!d.id_card_key;
    const hasBizReg = !!d.biz_reg_key;
    const hasHometax = !!(d.hometax_id && d.hometax_id.length);
    const complete = hasIdCard && hasBizReg && hasHometax;
    return {
      id: b.id,
      company_name: b.company_name,
      ceo_name: b.ceo_name,
      business_number_masked: b.business_number ? (b.business_number.slice(0, 3) + '-**-*****') : null,
      is_representative: owner,
      docs: {
        id_card: { uploaded: hasIdCard, at: d.id_card_uploaded_at || null },
        biz_reg: { uploaded: hasBizReg, at: d.biz_reg_uploaded_at || null },
        hometax: { saved: hasHometax, at: d.hometax_updated_at || null, hometax_id: hasHometax ? d.hometax_id : null },
      },
      complete,
      /* 본인이 대표가 아니면 요구 안 함 */
      required: owner,
    };
  });

  return Response.json({ businesses });
}

// ============ POST ============
export async function onRequestPost(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;
  if (!db || !bucket) return Response.json({ error: 'DB/R2 미설정' }, { status: 500 });

  const user = await getUser(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });
  if (user.approval_status !== 'approved_client') {
    return Response.json({ error: '기장 거래처만 이용 가능' }, { status: 403 });
  }
  await ensureTable(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'save_hometax';

  try {
    if (action === 'upload') return await handleUpload(context, db, bucket, user);
    return await handleSaveHometax(context, db, user);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// 홈택스 계정 저장 (JSON)
async function handleSaveHometax(context, db, user) {
  const body = await context.request.json();
  const businessId = Number(body.business_id || 0);
  if (!businessId) return Response.json({ error: 'business_id 필요' }, { status: 400 });

  // 소유권 체크
  const biz = await db.prepare(`SELECT id, ceo_name FROM client_businesses WHERE id = ? AND user_id = ?`)
    .bind(businessId, user.user_id).first();
  if (!biz) return Response.json({ error: 'not_found' }, { status: 404 });

  const hometaxId = (body.hometax_id || '').trim().slice(0, 100) || null;
  const hometaxPw = (body.hometax_password || '').trim().slice(0, 200) || null;

  if (!hometaxId && !hometaxPw) {
    return Response.json({ error: '홈택스 ID 또는 비번 중 하나는 필수' }, { status: 400 });
  }

  const now = kst();
  const existing = await db.prepare(`SELECT id FROM biz_docs WHERE user_id = ? AND business_id = ?`)
    .bind(user.user_id, businessId).first();

  const pwEnc = hometaxPw ? toBase64(hometaxPw) : null;

  if (existing) {
    await db.prepare(
      `UPDATE biz_docs SET hometax_id = COALESCE(?, hometax_id),
                            hometax_password_enc = COALESCE(?, hometax_password_enc),
                            hometax_updated_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(hometaxId, pwEnc, now, now, existing.id).run();
  } else {
    await db.prepare(
      `INSERT INTO biz_docs (user_id, business_id, hometax_id, hometax_password_enc, hometax_updated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(user.user_id, businessId, hometaxId, pwEnc, now, now, now).run();
  }

  return Response.json({ ok: true });
}

// 신분증·사업자등록증 파일 업로드
async function handleUpload(context, db, bucket, user) {
  const form = await context.request.formData();
  const businessId = Number(form.get('business_id') || 0);
  const kind = String(form.get('kind') || '');
  const file = form.get('file');
  if (!businessId) return Response.json({ error: 'business_id 필요' }, { status: 400 });
  if (!['id_card', 'biz_reg'].includes(kind)) return Response.json({ error: 'kind 오류 (id_card|biz_reg)' }, { status: 400 });
  if (!file || typeof file === 'string') return Response.json({ error: '파일 없음' }, { status: 400 });
  if (file.size > MAX_SIZE) return Response.json({ error: '10MB 이하만 업로드 가능' }, { status: 400 });

  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_TYPES.includes(mime)) return Response.json({ error: '이미지(JPG/PNG/HEIC) 또는 PDF만 가능' }, { status: 400 });

  // 소유권
  const biz = await db.prepare(`SELECT id, ceo_name FROM client_businesses WHERE id = ? AND user_id = ?`)
    .bind(businessId, user.user_id).first();
  if (!biz) return Response.json({ error: 'not_found' }, { status: 404 });

  const ext = mime.split('/')[1] || 'bin';
  const rand = Math.random().toString(36).slice(2, 8);
  const key = `biz_docs/u${user.user_id}/b${businessId}/${kind}_${Date.now()}_${rand}.${ext}`;
  const buf = await file.arrayBuffer();
  await bucket.put(key, buf, {
    httpMetadata: { contentType: mime },
    customMetadata: {
      user_id: String(user.user_id),
      business_id: String(businessId),
      kind,
      uploaded_at: kst(),
    },
  });

  const now = kst();
  const existing = await db.prepare(`SELECT id, id_card_key, biz_reg_key FROM biz_docs WHERE user_id = ? AND business_id = ?`)
    .bind(user.user_id, businessId).first();

  if (existing) {
    // 기존 키 삭제 (감사 목적이면 보존할 수도 있으나 중복 방지 위해 제거)
    const oldKey = kind === 'id_card' ? existing.id_card_key : existing.biz_reg_key;
    if (oldKey) { try { await bucket.delete(oldKey); } catch {} }
    if (kind === 'id_card') {
      await db.prepare(`UPDATE biz_docs SET id_card_key=?, id_card_uploaded_at=?, updated_at=? WHERE id=?`)
        .bind(key, now, now, existing.id).run();
    } else {
      await db.prepare(`UPDATE biz_docs SET biz_reg_key=?, biz_reg_uploaded_at=?, updated_at=? WHERE id=?`)
        .bind(key, now, now, existing.id).run();
    }
  } else {
    if (kind === 'id_card') {
      await db.prepare(
        `INSERT INTO biz_docs (user_id, business_id, id_card_key, id_card_uploaded_at, created_at, updated_at) VALUES (?,?,?,?,?,?)`
      ).bind(user.user_id, businessId, key, now, now, now).run();
    } else {
      await db.prepare(
        `INSERT INTO biz_docs (user_id, business_id, biz_reg_key, biz_reg_uploaded_at, created_at, updated_at) VALUES (?,?,?,?,?,?)`
      ).bind(user.user_id, businessId, key, now, now, now).run();
    }
  }

  return Response.json({ ok: true, key });
}

// ============ DELETE ============
export async function onRequestDelete(context) {
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });

  const user = await getUser(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const businessId = Number(url.searchParams.get('business_id') || 0);
  const kind = url.searchParams.get('kind');
  if (!businessId || !['id_card', 'biz_reg', 'hometax'].includes(kind)) {
    return Response.json({ error: 'business_id, kind 필요' }, { status: 400 });
  }

  const row = await db.prepare(`SELECT id, id_card_key, biz_reg_key FROM biz_docs WHERE user_id = ? AND business_id = ?`)
    .bind(user.user_id, businessId).first();
  if (!row) return Response.json({ ok: true });

  const now = kst();
  if (kind === 'id_card' && row.id_card_key) {
    try { await bucket.delete(row.id_card_key); } catch {}
    await db.prepare(`UPDATE biz_docs SET id_card_key=NULL, id_card_uploaded_at=NULL, updated_at=? WHERE id=?`).bind(now, row.id).run();
  } else if (kind === 'biz_reg' && row.biz_reg_key) {
    try { await bucket.delete(row.biz_reg_key); } catch {}
    await db.prepare(`UPDATE biz_docs SET biz_reg_key=NULL, biz_reg_uploaded_at=NULL, updated_at=? WHERE id=?`).bind(now, row.id).run();
  } else if (kind === 'hometax') {
    await db.prepare(`UPDATE biz_docs SET hometax_id=NULL, hometax_password_enc=NULL, hometax_updated_at=NULL, updated_at=? WHERE id=?`).bind(now, row.id).run();
  }
  return Response.json({ ok: true });
}
