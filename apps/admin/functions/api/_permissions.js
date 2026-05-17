/**
 * Phase Next-Day27 (2026-05-11): 권한 catalog 옛 백엔드 import (SSOT).
 *
 * scripts/export-permissions.mjs 가 build 시 _permissions.json 생성.
 * 이 파일이 그 JSON 을 import 해서 checkPermission() 으로 차단.
 *
 * 사장님 결정 2026-05-11: 권한 catalog 1곳 (packages/auth/src/rbac.ts) 만 수정
 * → 옛+새 자동 반영. "admin/staff 동기화 사고" 패턴 영구 차단.
 */

/* Phase 16 fix (2026-05-13): `import ... with { type: "json" }` 신문법 Cloudflare
 * wrangler esbuild 미지원 → 빌드 실패 (사장님 보여준 로그 04:12:05).
 * scripts/export-permissions.mjs 가 같은 데이터를 .js 모듈로도 export → 그것을 import. */
import permissionsData from "./_permissions-data.js";
import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

/** @type {{ permissions: Record<string, 'owner' | 'admin' | 'customer'> }} */
const { permissions } = permissionsData;

/**
 * Role 계산 — owner / admin / customer 3단계 (사장님 결정 2026-05-11).
 * @param {{ is_admin?: number | null; is_owner?: number | null }} user
 * @returns {'owner' | 'admin' | 'customer'}
 */
export function calculateRole(user) {
  if (user?.is_owner === 1) return 'owner';
  if (user?.is_admin === 1) return 'admin';
  return 'customer';
}

const ROLE_ORDER = ['customer', 'admin', 'owner'];

/**
 * 권한 체크 — required role 이상이어야 통과.
 * @param {'owner' | 'admin' | 'customer'} userRole
 * @param {string} permission key (PERMISSIONS catalog 의 키)
 * @returns {boolean}
 */
export function canDo(userRole, permission) {
  const required = permissions[permission];
  if (!required) {
    /* catalog 에 없는 권한 = fail-safe (deny by default) */
    return false;
  }
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(required);
}

/**
 * 옛 백엔드 endpoint 용 wrapper — checkAdmin 후 permission 검증까지.
 *
 * @example
 *   const auth = await checkPermission(context, 'admin:business:delete');
 *   if (!auth.ok) return new Response(auth.error, { status: auth.status });
 *   // auth.role / auth.userId / auth.user 사용 가능
 */
export async function checkPermission(context, permission) {
  const adminCheck = await checkAdmin(context);
  if (!adminCheck) {
    return {
      ok: false,
      status: 401,
      error: JSON.stringify({ error: 'unauthorized' }),
    };
  }

  const user = adminCheck.user || {};
  const role = calculateRole(user);

  if (!canDo(role, permission)) {
    return {
      ok: false,
      status: 403,
      error: JSON.stringify({
        error: 'forbidden',
        permission,
        required: permissions[permission] || 'unknown',
        actual: role,
      }),
    };
  }

  return {
    ok: true,
    role,
    userId: user.id || user.user_id || null,
    user,
  };
}

/** 헬퍼 응답 (HTTP). */
export function permissionForbidden(authResult) {
  return new Response(authResult.error, {
    status: authResult.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 옛 admin.html script tag 에서 inject 용 — 클라이언트 catalog 노출. */
export function getPermissionsCatalog() {
  return permissions;
}
