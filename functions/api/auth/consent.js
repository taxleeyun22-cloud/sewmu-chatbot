// 통합 동의 처리 (이용약관·개인정보 수집이용·국외이전·만14세·마케팅)
// GET  : 현재 사용자의 동의 상태 반환
// POST : 동의 처리 ({age_14, tos, privacy, overseas, marketing})
//        필수 4개(age_14/tos/privacy/overseas)는 true여야 성공, marketing은 선택

const REQUIRED = ['age_14', 'tos', 'privacy', 'overseas'];

async function ensureColumns(db) {
  const cols = [
    `ALTER TABLE users ADD COLUMN consent_age_14 INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN consent_tos INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN consent_privacy INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN consent_overseas INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN consent_overseas_at TEXT`,
    `ALTER TABLE users ADD COLUMN consent_marketing INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN consent_all_at TEXT`,
  ];
  for (const q of cols) { try { await db.prepare(q).run(); } catch {} }
}

async function getUserId(db, request) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/session=([^;]+)/);
  if (!m) return null;
  try {
    const s = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(m[1]).first();
    return s ? s.user_id : null;
  } catch { return null; }
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureColumns(db);
  const userId = await getUserId(db, context.request);
  if (!userId) return Response.json({ error: "로그인 필요" }, { status: 401 });
  try {
    const u = await db.prepare(
      `SELECT consent_age_14, consent_tos, consent_privacy, consent_overseas, consent_marketing,
              consent_overseas_at, consent_all_at
       FROM users WHERE id = ?`
    ).bind(userId).first();
    return Response.json({
      age_14: u?.consent_age_14 ? true : false,
      tos: u?.consent_tos ? true : false,
      privacy: u?.consent_privacy ? true : false,
      overseas: u?.consent_overseas ? true : false,
      marketing: u?.consent_marketing ? true : false,
      consent_all_at: u?.consent_all_at || null,
      consent_overseas_at: u?.consent_overseas_at || null,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  await ensureColumns(db);
  const userId = await getUserId(db, context.request);
  if (!userId) return Response.json({ error: "로그인 필요" }, { status: 401 });

  let body = {};
  try { body = await context.request.json(); } catch {}

  const age_14 = body.age_14 === true || body.age_14 === 1;
  const tos = body.tos === true || body.tos === 1;
  const privacy = body.privacy === true || body.privacy === 1;
  const overseas = body.overseas === true || body.overseas === 1;
  const marketing = body.marketing === true || body.marketing === 1;

  if (!age_14 || !tos || !privacy || !overseas) {
    return Response.json({ error: "필수 항목 4가지 모두 동의해 주세요" }, { status: 400 });
  }

  const now = kst();
  try {
    await db.prepare(
      `UPDATE users SET
         consent_age_14 = 1,
         consent_tos = 1,
         consent_privacy = 1,
         consent_overseas = 1,
         consent_overseas_at = COALESCE(consent_overseas_at, ?),
         consent_marketing = ?,
         consent_all_at = ?
       WHERE id = ?`
    ).bind(now, marketing ? 1 : 0, now, userId).run();
    return Response.json({ ok: true, consent_all_at: now, marketing });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
