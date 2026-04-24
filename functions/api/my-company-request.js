// 🏢 거래처 업체 등록 요청 (고객 본인이 입력)
//
// 세션 로그인 후 마이페이지에서 "업체 등록 요청" 눌러 자기 상호·사업자번호·역할을
// 미리 입력. 세무사가 승인 시 자동으로 폼에 채워짐 → 원클릭 승인·연결 가능.
//
// POST /api/my-company-request
//   body {company_name, business_number?, role: '대표자'|'담당자'}
//   → users.requested_company_name / requested_business_number / requested_role 저장
//
// GET /api/my-company-request
//   → 현재 내가 제출한 요청 내용 반환

async function getUserFromCookie(db, request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  try {
    const row = await db.prepare(
      `SELECT s.user_id FROM sessions s WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).bind(match[1]).first();
    return row || null;
  } catch { return null; }
}

async function ensureColumns(db) {
  const add = (sql) => db.prepare(sql).run().catch(()=>{});
  await add(`ALTER TABLE users ADD COLUMN requested_company_name TEXT`);
  await add(`ALTER TABLE users ADD COLUMN requested_business_number TEXT`);
  await add(`ALTER TABLE users ADD COLUMN requested_role TEXT`);
  await add(`ALTER TABLE users ADD COLUMN requested_at TEXT`);
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureColumns(db);
  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });
  try {
    const r = await db.prepare(
      `SELECT requested_company_name, requested_business_number, requested_role, requested_at
         FROM users WHERE id = ?`
    ).bind(user.user_id).first();
    return Response.json({ ok: true, request: r || null });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureColumns(db);
  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: '로그인 필요' }, { status: 401 });
  let body = {};
  try { body = await context.request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  const name = String(body.company_name || '').trim().slice(0, 120);
  const realName = String(body.real_name || '').trim().slice(0, 20);
  const bn = String(body.business_number || '').replace(/\D/g, '').slice(0, 12);
  const role = body.role === '대표자' ? '대표자' : (body.role === '담당자' ? '담당자' : null);
  if (!name) return Response.json({ error: '회사명(상호) 을 입력해주세요' }, { status: 400 });
  if (!realName || realName.length < 2) return Response.json({ error: '본인 실명을 2자 이상 입력해주세요' }, { status: 400 });
  if (!role) return Response.json({ error: '역할(대표자/담당자) 를 선택해주세요' }, { status: 400 });
  try {
    await db.prepare(
      `UPDATE users SET requested_company_name = ?, requested_business_number = ?, requested_role = ?, requested_at = ?, real_name = ? WHERE id = ?`
    ).bind(name, bn || null, role, kst(), realName, user.user_id).run();
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}
