// 사용자 본인 사업장 관리 (세션 기반 인증, 본인 것만)
// - GET: 내 사업장 목록
// - POST: 신규 추가 (user_claimed=1 마킹, admin 승인 필요)
// - PUT: 내 사업장 수정 (본인 등록분만, user_claimed=1 초기화됨)
// - DELETE: 내 사업장 삭제 (본인 등록분만, admin 등록분은 못 지움)

const MAX_BUSINESSES_PER_USER = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1분
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const key = String(userId);
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

async function getUserFromCookie(db, request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  try {
    const row = await db.prepare(
      `SELECT s.user_id, u.approval_status FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).bind(match[1]).first();
    return row || null;
  } catch { return null; }
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS client_businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    company_name TEXT,
    business_number TEXT,
    ceo_name TEXT,
    industry TEXT,
    business_type TEXT,
    tax_type TEXT,
    establishment_date TEXT,
    address TEXT,
    phone TEXT,
    employee_count INTEGER,
    last_revenue INTEGER,
    vat_period TEXT,
    notes TEXT,
    is_primary INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    updated_by TEXT,
    user_claimed INTEGER DEFAULT 0
  )`).run();
  try { await db.prepare(`ALTER TABLE client_businesses ADD COLUMN user_claimed INTEGER DEFAULT 0`).run(); } catch {}
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

// 사용자 응답에서 제외할 필드 (세무사 전용)
function sanitizeForUser(biz) {
  if (!biz) return null;
  const out = { ...biz };
  // 매출은 가리기
  delete out.last_revenue;
  // 세무사 메모는 사용자가 입력한 건 보여줌, 아니면 숨김
  if (!out.user_claimed) delete out.notes;
  // 사업자번호 마스킹
  if (out.business_number) {
    const biz = out.business_number;
    out.business_number_masked = biz.length >= 10 ? `${biz.slice(0,3)}-**-*****` : biz;
    delete out.business_number;
  }
  return out;
}

// 검증
function validateInput(body) {
  const errors = [];
  const bizDigits = (body.business_number || "").replace(/\D/g, "");
  if (bizDigits && bizDigits.length !== 10) errors.push("사업자등록번호는 10자리 숫자입니다");
  if (body.company_name && body.company_name.length > 80) errors.push("상호가 너무 깁니다 (80자 이내)");
  if (body.ceo_name && body.ceo_name.length > 40) errors.push("대표자명이 너무 깁니다");
  if (body.industry && body.industry.length > 60) errors.push("업종이 너무 깁니다");
  if (body.address && body.address.length > 200) errors.push("주소가 너무 깁니다");
  if (body.notes && body.notes.length > 500) errors.push("메모는 500자 이내");
  const validTaxTypes = ["", "일반과세", "간이과세", "면세", "법인"];
  if (body.tax_type && !validTaxTypes.includes(body.tax_type)) errors.push("과세유형 값이 올바르지 않습니다");
  const validBizTypes = ["", "개인", "법인"];
  if (body.business_type && !validBizTypes.includes(body.business_type)) errors.push("사업형태 값이 올바르지 않습니다");
  if (body.employee_count != null && body.employee_count !== '' && (isNaN(Number(body.employee_count)) || Number(body.employee_count) < 0 || Number(body.employee_count) > 100000)) {
    errors.push("직원수가 올바르지 않습니다");
  }
  return errors;
}

// GET: 내 사업장 목록
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ businesses: [] });

  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });

  await ensureTable(db);

  try {
    const { results } = await db.prepare(`
      SELECT id, company_name, business_number, ceo_name, industry,
             business_type, tax_type, establishment_date, address, phone,
             employee_count, vat_period, notes, is_primary, user_claimed, updated_at
      FROM client_businesses WHERE user_id = ?
      ORDER BY is_primary DESC, id ASC
    `).bind(user.user_id).all();

    return Response.json({
      businesses: (results || []).map(sanitizeForUser),
      can_add: (results || []).length < MAX_BUSINESSES_PER_USER,
      max_count: MAX_BUSINESSES_PER_USER,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST: 신규 사업장 추가 (user_claimed=1)
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });
  if (!checkRateLimit(user.user_id)) return Response.json({ error: "요청이 너무 많습니다" }, { status: 429 });

  await ensureTable(db);

  try {
    const body = await context.request.json();
    const errors = validateInput(body);
    if (errors.length > 0) return Response.json({ error: errors[0] }, { status: 400 });

    // 개수 제한
    const countRow = await db.prepare(
      `SELECT COUNT(*) as c FROM client_businesses WHERE user_id = ?`
    ).bind(user.user_id).first();
    if ((countRow?.c || 0) >= MAX_BUSINESSES_PER_USER) {
      return Response.json({ error: `사업장은 최대 ${MAX_BUSINESSES_PER_USER}개까지 등록 가능합니다` }, { status: 400 });
    }

    const now = kst();
    const bizNo = (body.business_number || "").replace(/\D/g, "") || null;

    const result = await db.prepare(`
      INSERT INTO client_businesses (
        user_id, company_name, business_number, ceo_name, industry,
        business_type, tax_type, establishment_date, address, phone,
        employee_count, vat_period, notes, is_primary, user_claimed,
        created_at, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 'user')
    `).bind(
      user.user_id,
      body.company_name || null,
      bizNo,
      body.ceo_name || null,
      body.industry || null,
      body.business_type || null,
      body.tax_type || null,
      body.establishment_date || null,
      body.address || null,
      body.phone || null,
      body.employee_count != null && body.employee_count !== '' ? Number(body.employee_count) : null,
      body.vat_period || null,
      body.notes || null,
      now, now
    ).run();

    return Response.json({
      ok: true,
      id: result.meta?.last_row_id,
      pending_review: true,
      message: "등록 완료되었습니다. 세무사 검토 후 AI에 반영됩니다.",
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PUT: 내 사업장 수정 (본인 user_claimed 건만)
export async function onRequestPut(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });
  if (!checkRateLimit(user.user_id)) return Response.json({ error: "요청이 너무 많습니다" }, { status: 429 });

  await ensureTable(db);

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    // 소유 확인 (user_id 일치)
    const existing = await db.prepare(
      `SELECT user_id, user_claimed FROM client_businesses WHERE id = ?`
    ).bind(id).first();
    if (!existing) return Response.json({ error: "사업장을 찾을 수 없습니다" }, { status: 404 });
    if (existing.user_id !== user.user_id) return Response.json({ error: "접근 권한 없음" }, { status: 403 });
    if (!existing.user_claimed) {
      return Response.json({ error: "세무사가 등록한 사업장은 수정할 수 없습니다. 변경 요청은 카톡 채널로 연락해 주세요." }, { status: 403 });
    }

    const body = await context.request.json();
    const errors = validateInput(body);
    if (errors.length > 0) return Response.json({ error: errors[0] }, { status: 400 });

    const bizNo = (body.business_number || "").replace(/\D/g, "") || null;
    const now = kst();

    // 수정 시 user_claimed=1 유지 (세무사 재검토 필요)
    await db.prepare(`
      UPDATE client_businesses SET
        company_name = ?, business_number = ?, ceo_name = ?, industry = ?,
        business_type = ?, tax_type = ?, establishment_date = ?, address = ?,
        phone = ?, employee_count = ?, vat_period = ?, notes = ?,
        user_claimed = 1, updated_at = ?, updated_by = 'user'
      WHERE id = ? AND user_id = ?
    `).bind(
      body.company_name || null,
      bizNo,
      body.ceo_name || null,
      body.industry || null,
      body.business_type || null,
      body.tax_type || null,
      body.establishment_date || null,
      body.address || null,
      body.phone || null,
      body.employee_count != null && body.employee_count !== '' ? Number(body.employee_count) : null,
      body.vat_period || null,
      body.notes || null,
      now, id, user.user_id
    ).run();

    return Response.json({ ok: true, pending_review: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: 내 사업장 삭제 (본인 user_claimed 건만)
export async function onRequestDelete(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });
  if (!checkRateLimit(user.user_id)) return Response.json({ error: "요청이 너무 많습니다" }, { status: 429 });

  await ensureTable(db);

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const existing = await db.prepare(
      `SELECT user_id, user_claimed FROM client_businesses WHERE id = ?`
    ).bind(id).first();
    if (!existing) return Response.json({ error: "사업장을 찾을 수 없습니다" }, { status: 404 });
    if (existing.user_id !== user.user_id) return Response.json({ error: "접근 권한 없음" }, { status: 403 });
    if (!existing.user_claimed) {
      return Response.json({ error: "세무사가 등록한 사업장은 삭제할 수 없습니다" }, { status: 403 });
    }

    await db.prepare(
      `DELETE FROM client_businesses WHERE id = ? AND user_id = ?`
    ).bind(id, user.user_id).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
