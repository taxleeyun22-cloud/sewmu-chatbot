// 공통 관리자 인증 헬퍼
// 다음 두 경로 중 하나면 인증 통과:
//   (1) ?key=<ADMIN_KEY> — 원조 관리자(사장님)
//   (2) 로그인 세션 쿠키 + users.is_admin = 1 — 사장님이 승인한 직원 관리자
//
// 반환: { ok: true, owner: boolean, userId: number|null }  실패 시 null

/* 보안: timing-safe 문자열 비교 (길이 고정 XOR 누적) */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkAdmin(context) {
  const url = new URL(context.request.url);
  const adminKey = context.env.ADMIN_KEY;

  // (1) ADMIN_KEY — timing-safe 비교
  const providedKey = url.searchParams.get("key");
  if (adminKey && providedKey && timingSafeEqual(providedKey, adminKey)) {
    return { ok: true, owner: true, userId: null };
  }

  // (2) 세션 쿠키 + is_admin
  const db = context.env.DB;
  if (!db) return null;
  const cookie = context.request.headers.get("Cookie") || "";
  const m = cookie.match(/session=([^;]+)/);
  if (!m) return null;

  try {
    // 컬럼 보장 (lazy migration)
    try { await db.prepare(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`).run(); } catch {}
    const row = await db.prepare(`
      SELECT s.user_id, u.is_admin
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).bind(m[1]).first();
    if (row && row.is_admin) {
      return { ok: true, owner: false, userId: row.user_id };
    }
  } catch {}
  return null;
}

export function adminUnauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function ownerOnly() {
  return Response.json({ error: "owner 권한이 필요합니다" }, { status: 403 });
}
