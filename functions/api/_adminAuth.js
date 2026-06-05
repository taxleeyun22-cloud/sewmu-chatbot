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

/**
 * admin_key_auth HMAC 쿠키 검증 — 새 admin(admin-key-auth.ts)과 동일, 만료 30일.
 * 사장님 비번 한 번 → 30일 유지(2026-06-05). 토큰 = "owner:{ts}.{base64(HMAC-SHA256(payload, AUTH_SECRET))}".
 * AUTH_SECRET 없으면(또는 위조면) false → 기존 인증 경로로 안전 fallback (추가 경로일 뿐 기존 로직 무영향).
 */
async function verifyOwnerToken(token, secret) {
  if (!token || !secret) return false;
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return false;
    const payload = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const bin = atob(sigB64);
    const sig = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) sig[i] = bin.charCodeAt(i);
    const ok = await crypto.subtle.verify('HMAC', key, sig, enc.encode(payload));
    if (!ok) return false;
    const m = payload.match(/^owner:(\d+)$/);
    if (!m) return false;
    if (Date.now() - Number(m[1]) > 30 * 86400 * 1000) return false; // 30일 만료
    return true;
  } catch {
    return false;
  }
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

  const cookie = context.request.headers.get("Cookie") || "";

  // (1b) admin_key_auth HMAC 쿠키 → owner (사장님 비번 한 번 → 30일 유지, 2026-06-05).
  //      서명 secret = ADMIN_KEY (admin-key-login 과 동일). 추가 경로일 뿐 —
  //      위조/만료/ADMIN_KEY 없음이면 false 로 아래 기존 경로 그대로 진행 (무영향).
  const akMatch = cookie.match(/admin_key_auth=([^;]+)/);
  if (akMatch && adminKey && await verifyOwnerToken(akMatch[1], adminKey)) {
    return { ok: true, owner: true, userId: null, adminRole: 'owner' };
  }

  // (2) 세션 쿠키 + is_admin
  const db = context.env.DB;
  if (!db) return null;
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

/**
 * Phase 13 (2026-05-12): CSRF Origin/Referer 가드.
 *
 * 옛 admin POST endpoint 들은 cookie 만 검증 → CSRF 취약. 다른 사이트가
 * `<form action="https://sewmu-chatbot.pages.dev/api/admin-users?action=set_admin">`
 * 같은 폼 자동 제출하면 사장님 admin cookie 가 같이 전송되어 권한 변경 가능.
 *
 * 방어: HTTP method 가 GET/HEAD 가 아닌 모든 요청에 대해:
 *   - Origin / Referer 헤더 확인 → 우리 도메인 또는 동일 출처여야 함
 *   - 없거나 다른 도메인 → 403 (CSRF 차단)
 *
 * 화이트리스트:
 *   - sewmu-chatbot.pages.dev (옛 admin prod)
 *   - sewmu-admin.pages.dev (새 admin prod)
 *   - *.pages.dev preview (사장님 브랜치 deploy)
 *   - localhost (개발)
 *
 * 사용 (functions/api/admin-*.js):
 *   import { checkOriginCsrf } from './_adminAuth.js';
 *   const csrf = checkOriginCsrf(context.request, context.env);
 *   if (csrf) return csrf;  // 403 응답
 *
 * 예외: ADMIN_KEY URL param 인증 (사장님 직접 브라우저 진입) 은 CSRF 무관 — 별도 처리.
 */
const ALLOWED_HOSTS = new Set([
  'sewmu-chatbot.pages.dev',
  'sewmu-admin.pages.dev',
  'localhost',
  '127.0.0.1',
]);

function isAllowedOrigin(originOrReferer) {
  if (!originOrReferer) return false;
  try {
    const u = new URL(originOrReferer);
    if (ALLOWED_HOSTS.has(u.hostname)) return true;
    /* Cloudflare Pages preview branch: <branch>.<project>.pages.dev */
    if (u.hostname.endsWith('.sewmu-chatbot.pages.dev')) return true;
    if (u.hostname.endsWith('.sewmu-admin.pages.dev')) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * GET/HEAD 외 모든 method 에 대해 Origin/Referer 검증.
 * 통과 시 null 반환. 실패 시 Response (403) 반환.
 *
 * @param {Request} request
 * @param {{ADMIN_KEY?:string}} [env] — Cloudflare Pages env binding (선택).
 *   전달 시 `?key=` 값이 실제 ADMIN_KEY 와 일치할 때만 bypass.
 *   미전달 시 모든 `?key=` 가 bypass — Phase 15 audit 에서 발견된 우회 취약점 fix.
 */
export function checkOriginCsrf(request, env) {
  const method = (request.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null; // safe method
  }
  /* ADMIN_KEY URL param 인증 — third-party 가 key 값 모르면 위변조 불가.
   * 단, env 전달돼서 실제 timing-safe 일치 확인까지 됐을 때만 bypass.
   * env 미전달 시 (테스트 환경 등) 안전 fallback: Origin/Referer 검증으로 진행.
   * Phase 15 (2026-05-12) audit fix: 이전엔 임의 key 값으로 bypass 됐음. */
  const url = new URL(request.url);
  const urlKey = url.searchParams.get('key');
  if (urlKey && env?.ADMIN_KEY && timingSafeEqual(urlKey, env.ADMIN_KEY)) {
    return null;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  /* Origin 있으면 그것 우선 (RFC 6454) */
  if (origin) {
    if (isAllowedOrigin(origin)) return null;
  } else if (referer) {
    if (isAllowedOrigin(referer)) return null;
  } else {
    /* Origin/Referer 둘 다 없음 — 직접 curl / Postman 등.
     * 사장님이 의도해서 호출했을 가능성 있지만, 브라우저 흐름은 항상 둘 중 하나가
     * 있음. 안전 default 는 차단. ADMIN_KEY URL 인증은 위에서 이미 통과 처리됨. */
    return Response.json(
      { error: 'CSRF: Origin/Referer header required' },
      { status: 403 },
    );
  }
  return Response.json(
    { error: 'CSRF: cross-origin request blocked' },
    { status: 403 },
  );
}

