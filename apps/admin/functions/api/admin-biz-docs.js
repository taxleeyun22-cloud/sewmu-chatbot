// 관리자: 거래처별 필수 서류 조회
// GET /api/admin-biz-docs?user_id=N
// GET /api/admin-biz-docs?user_id=N&action=image&business_id=B&kind=id_card|biz_reg
//     → R2 이미지 스트리밍 (관리자 인증 필요)
//
// 인증: checkAdmin (ADMIN_KEY 또는 직원 세션)

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

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
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  const bucket = context.env.MEDIA_BUCKET;
  if (!db) return Response.json({ error: 'DB 미설정' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');

  /* 이미지 스트리밍 (관리자 전용) */
  if (action === 'image') {
    if (!bucket) return new Response('R2 not configured', { status: 500 });
    const userId = Number(url.searchParams.get('user_id') || 0);
    const businessId = Number(url.searchParams.get('business_id') || 0);
    const kind = url.searchParams.get('kind');
    if (!userId || !businessId || !['id_card','biz_reg'].includes(kind)) {
      return new Response('bad params', { status: 400 });
    }
    const row = await db.prepare(
      `SELECT id_card_key, biz_reg_key FROM biz_docs WHERE user_id = ? AND business_id = ?`
    ).bind(userId, businessId).first();
    const key = kind === 'id_card' ? row?.id_card_key : row?.biz_reg_key;
    if (!key) return new Response('not found', { status: 404 });
    const obj = await bucket.get(key);
    if (!obj) return new Response('not found', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'private, max-age=0');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    return new Response(obj.body, { headers });
  }

  /* 기본: user_id 받아 거래처 전체 서류 현황 반환 */
  const userId = Number(url.searchParams.get('user_id') || 0);
  if (!userId) return Response.json({ error: 'user_id 필요' }, { status: 400 });

  const { results: bizRows } = await db.prepare(
    `SELECT id, company_name, ceo_name, business_number, address, is_primary
     FROM client_businesses WHERE user_id = ? ORDER BY is_primary DESC, id ASC`
  ).bind(userId).all();

  const { results: docRows } = await db.prepare(
    `SELECT business_id, id_card_key, id_card_uploaded_at,
            biz_reg_key, biz_reg_uploaded_at, hometax_id, hometax_updated_at
     FROM biz_docs WHERE user_id = ?`
  ).bind(userId).all();
  const byBiz = {};
  (docRows || []).forEach(d => byBiz[d.business_id] = d);

  const user = await db.prepare(
    `SELECT real_name, name, phone FROM users WHERE id = ?`
  ).bind(userId).first();

  const businesses = (bizRows || []).map(b => {
    const d = byBiz[b.id] || {};
    return {
      id: b.id,
      company_name: b.company_name,
      ceo_name: b.ceo_name,
      business_number: b.business_number,
      is_primary: b.is_primary,
      docs: {
        id_card: {
          uploaded: !!d.id_card_key,
          at: d.id_card_uploaded_at || null,
          image_url: d.id_card_key
            ? `/api/admin-biz-docs?action=image&user_id=${userId}&business_id=${b.id}&kind=id_card` + (url.searchParams.get('key') ? `&key=${encodeURIComponent(url.searchParams.get('key'))}` : '')
            : null,
        },
        biz_reg: {
          uploaded: !!d.biz_reg_key,
          at: d.biz_reg_uploaded_at || null,
          image_url: d.biz_reg_key
            ? `/api/admin-biz-docs?action=image&user_id=${userId}&business_id=${b.id}&kind=biz_reg` + (url.searchParams.get('key') ? `&key=${encodeURIComponent(url.searchParams.get('key'))}` : '')
            : null,
        },
        hometax: {
          saved: !!(d.hometax_id && d.hometax_id.length),
          at: d.hometax_updated_at || null,
          hometax_id: d.hometax_id || null,
        },
      },
    };
  });

  return Response.json({
    user: user ? { id: userId, real_name: user.real_name, name: user.name, phone: user.phone } : null,
    businesses
  });
}
