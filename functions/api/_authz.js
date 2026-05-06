/**
 * Phase #10 메타 (2026-05-06): RBAC 권한 미들웨어 — 3-tier role-based access control.
 *
 * 기존 _adminAuth.js (owner / admin 2-tier) 의 상위 호환 wrapper.
 * 점진 마이그레이션 — 새 endpoint 또는 권한 분기 추가 시 이 모듈 사용.
 * 기존 endpoint 의 checkAdmin / ownerOnly 는 그대로 유지 (회귀 0).
 *
 * Role 체계:
 *   - owner    : 사장님 — ADMIN_KEY 또는 user_id=1 + is_admin=1
 *   - manager  : 사업장 관리자 — is_admin=1 + staff_role='manager'
 *   - staff    : 일반 admin — is_admin=1 (default)
 *
 * 권한 계층 (상위는 하위 포함):
 *   owner > manager > staff
 *   = owner 통과 시 manager·staff 도 자동 통과
 *   = manager 통과 시 staff 도 자동 통과
 *
 * 사용 예:
 *   import { checkRole, roleForbidden } from "./_authz.js";
 *
 *   const auth = await checkRole(context, 'manager');
 *   if (!auth.ok) return roleForbidden(auth);
 *   // auth.role / auth.userId / auth.owner / auth.manager 사용 가능
 */

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

/**
 * 사용자의 staff_role 조회 (lazy migration 포함).
 * @param {*} db D1 binding
 * @param {number} userId
 * @returns {'manager' | 'staff' | null}
 */
async function fetchStaffRole(db, userId) {
  if (!userId) return null;
  /* lazy migration — column 없으면 추가 */
  try {
    await db.prepare(`ALTER TABLE users ADD COLUMN staff_role TEXT`).run();
  } catch {}
  try {
    const row = await db.prepare(`SELECT staff_role FROM users WHERE id = ?`).bind(userId).first();
    if (!row) return null;
    const raw = String(row.staff_role || '').trim();
    if (raw === 'manager' || raw === 'staff') return raw;
    return null;
  } catch {
    return null;
  }
}

/**
 * 권한 체크 — 통합 진입점.
 *
 * @param {*} context Pages Functions context
 * @param {'owner' | 'manager' | 'staff'} requiredRole
 * @returns {Promise<{
 *   ok: boolean,
 *   role: 'owner' | 'manager' | 'staff' | null,
 *   userId: number | null,
 *   owner: boolean,
 *   manager: boolean,
 *   reason?: 'unauthorized' | 'forbidden',
 * }>}
 */
export async function checkRole(context, requiredRole = 'staff') {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) {
    return { ok: false, role: null, userId: null, owner: false, manager: false, reason: 'unauthorized' };
  }

  const userId = auth.userId || null;
  const isOwner = !!auth.owner;

  /* owner 는 모든 단계 통과 */
  if (isOwner) {
    return { ok: true, role: 'owner', userId, owner: true, manager: true };
  }

  /* manager 조회 (cookie-only 경로에서만 staff_role 의미 있음) */
  let staffRole = 'staff';
  try {
    const db = context.env.DB;
    if (db && userId) {
      const r = await fetchStaffRole(db, userId);
      if (r) staffRole = r;
    }
  } catch {}

  const isManager = staffRole === 'manager';
  const role = isManager ? 'manager' : 'staff';

  /* 요구 단계별 판단 */
  if (requiredRole === 'owner') {
    return { ok: false, role, userId, owner: false, manager: isManager, reason: 'forbidden' };
  }
  if (requiredRole === 'manager') {
    if (!isManager) {
      return { ok: false, role, userId, owner: false, manager: false, reason: 'forbidden' };
    }
    return { ok: true, role: 'manager', userId, owner: false, manager: true };
  }
  /* requiredRole === 'staff' (default) — admin 이면 모두 통과 */
  return { ok: true, role, userId, owner: false, manager: isManager };
}

/**
 * 권한 거부 응답 — checkRole 결과를 그대로 받아 적절한 status 반환.
 *
 * @param {*} authResult checkRole 반환값
 */
export function roleForbidden(authResult) {
  if (!authResult || authResult.reason === 'unauthorized') {
    return adminUnauthorized();
  }
  return Response.json(
    { error: '권한이 부족합니다', role: authResult.role || 'staff' },
    { status: 403 },
  );
}

/**
 * 현재 인증된 사용자의 role 정보 응답 — 프론트에서 IS_MANAGER 등 UI 가드 결정용.
 * GET /api/admin-whoami 같은 endpoint 에서 호출.
 *
 * @param {*} context
 * @returns {Promise<{ ok, role, owner, manager, userId }>}
 */
export async function whoami(context) {
  const auth = await checkRole(context, 'staff');
  if (!auth.ok) {
    return { ok: false, role: null, owner: false, manager: false, userId: null };
  }
  return {
    ok: true,
    role: auth.role,
    owner: auth.owner,
    manager: auth.manager,
    userId: auth.userId,
  };
}
