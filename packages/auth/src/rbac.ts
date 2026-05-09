/**
 * Phase Next-Week4 (2026-05-09): RBAC 3단계 미들웨어.
 *
 * 사장님 명령 (Phase #10): owner / manager / staff 권한 분리.
 * 기존 functions/api/_authz.js 의 checkRole 마이그레이션.
 */

export type Role = 'owner' | 'manager' | 'staff' | 'customer';

export interface UserContext {
  userId: number | null;
  isAdmin: boolean;
  isOwner: boolean;
  staffRole: 'manager' | 'staff' | null;
  approvalStatus: string | null;
}

/**
 * 권한 계산 — DB row → role.
 *
 * Owner = is_owner=1 (사장님 1명, user_id=1 하드코딩 폐기 후)
 * Manager = is_admin=1 + staff_role='manager'
 * Staff = is_admin=1 (default 또는 staff_role='staff')
 * Customer = is_admin=0
 */
export function calculateRole(user: {
  is_admin?: number | null;
  is_owner?: number | null;
  staff_role?: string | null;
}): Role {
  if (user.is_owner === 1) return 'owner';
  if (user.is_admin === 1) {
    if (user.staff_role === 'manager') return 'manager';
    return 'staff';
  }
  return 'customer';
}

/**
 * 권한 체크 — 최소 role 이상이어야 통과.
 *
 * 권한 위계: owner > manager > staff > customer.
 */
export function hasRole(userRole: Role, requiredRole: Role): boolean {
  const order: Role[] = ['customer', 'staff', 'manager', 'owner'];
  return order.indexOf(userRole) >= order.indexOf(requiredRole);
}

/**
 * 권한 별 가능 액션 (정책 정의).
 */
export const PERMISSIONS = {
  // Owner only
  'admin:user:set_admin': 'owner' as Role,           // admin 권한 부여/회수
  'admin:business:delete': 'owner' as Role,          // 업체 영구 삭제
  'admin:user:delete': 'owner' as Role,              // 사용자 영구 삭제

  // Manager+
  'admin:internal:read': 'manager' as Role,          // 관리자방 진입
  'admin:user:approve': 'manager' as Role,           // 사용자 승인 / 거절
  'admin:bulk_send': 'manager' as Role,              // 단체발송

  // Staff+
  'admin:user:read': 'staff' as Role,                // 사용자 조회
  'admin:business:read': 'staff' as Role,            // 업체 조회
  'admin:room:read': 'staff' as Role,                // 상담방 조회
  'admin:memo:write': 'staff' as Role,               // 메모 작성
  'admin:doc:approve': 'staff' as Role,              // 문서 승인

  // Customer
  'customer:chat': 'customer' as Role,
  'customer:upload_doc': 'customer' as Role,
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * 권한 체크 헬퍼.
 *
 * @example
 *   if (!can(userRole, 'admin:business:delete')) throw new Error('Forbidden');
 */
export function can(userRole: Role, permission: Permission): boolean {
  const required = PERMISSIONS[permission];
  return hasRole(userRole, required);
}
