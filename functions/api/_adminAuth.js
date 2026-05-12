// 공통 관리자 인증 헬퍼
// 다음 경로 중 하나면 인증 통과:
//   (1) ?key=<ADMIN_KEY> — 원조 관리자(사장님)
//   (2) 로그인 세션 쿠키 + users.is_admin = 1 — 사장님이 승인한 직원 관리자
//
// 반환: { ok: true, owner: boolean, userId: number|null, adminRole: string|null }
//       실패 시 null
//
// Phase Next-Day29 (2026-05-12) 사장님 명령 "노션 권한 5단계":
//   - users.admin_role 컬럼 lazy migration ('owner' | 'admin' | 'editor' | 'viewer')
//   - 응답에 adminRole 포함 → admin.js 가 IS_OWNER / IS_ADMIN / IS_EDITOR / IS_VIEWER 결정

/* 보안: timing-safe 문자열 비교 (길이 고정 XOR 누적) */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** admin_role + is_admin/is_owner → 5단계 role 결정. */
function calculateAdminRole(row) {
  if (!row) return null;
  if (row.admin_role === 'owner') return 'owner';
  if (row.admin_role === 'admin') return 'admin';
  if (row.admin_role === 'editor') return 'editor';
  if (row.admin_role === 'viewer') return 'viewer';
  /* admin_role 미지정 시 옛 컬럼 호환 */
  if (Number(row.user_id) === 1 && row.is_admin === 1) return 'owner';
  if (row.is_admin === 1) return 'admin';
  return null;
}

export async function checkAdmin(context) {
  const url = new URL(context.request.url);
  const adminKey = context.env.ADMIN_KEY;

  // (1) ADMIN_KEY — timing-safe 비교 (사장님 비번 진입 = 항상 owner)
  const providedKey = url.searchParams.get("key");
  if (adminKey && providedKey && timingSafeEqual(providedKey, adminKey)) {
    return { ok: true, owner: true, userId: null, adminRole: 'owner' };
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
    /* Phase Next-Day29 (2026-05-12) 사장님 명령 "노션 권한":
     * admin_role 컬럼 ('owner' | 'admin' | 'editor' | 'viewer' | NULL)
     * NULL = 거래처 또는 admin_role 미지정 → is_admin 컬럼 fallback */
    try { await db.prepare(`ALTER TABLE users ADD COLUMN admin_role TEXT`).run(); } catch {}

    const row = await db.prepare(`
      SELECT s.user_id, u.is_admin, u.admin_role
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).bind(m[1]).first();

    if (row && (row.is_admin || row.admin_role)) {
      const adminRole = calculateAdminRole({
        user_id: row.user_id,
        is_admin: row.is_admin,
        admin_role: row.admin_role,
      });
      if (!adminRole) return null;
      /* 사장님(이재윤, user_id=1) cookie 로그인도 owner 권한 부여 (legacy 호환). */
      const isOwner = adminRole === 'owner' || Number(row.user_id) === 1;
      return {
        ok: true,
        owner: isOwner,
        userId: row.user_id,
        adminRole, // 'owner' | 'admin' | 'editor' | 'viewer'
      };
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

/** 노션 권한 체크 — admin_role 또는 is_admin 따라 hasRole. */
export function hasAdminRole(auth, required) {
  if (!auth || !auth.ok) return false;
  const order = ['viewer', 'editor', 'admin', 'owner'];
  const userIdx = order.indexOf(auth.adminRole);
  const reqIdx = order.indexOf(required);
  if (userIdx === -1 || reqIdx === -1) return false;
  return userIdx >= reqIdx;
}

export function roleForbidden(required) {
  return Response.json({
    error: `${required} 이상의 권한이 필요합니다`,
  }, { status: 403 });
}
