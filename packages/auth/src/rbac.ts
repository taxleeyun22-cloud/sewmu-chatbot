/**
 * Phase Next-Day27 (2026-05-11): RBAC 3단계 (사장님 결정 2026-05-11 — 매니저/스태프 통합).
 *
 * Role: owner / admin / customer (직원 = admin 통합)
 *
 * Owner-only (사장님 명시 결정 2026-05-11):
 *   1. admin 권한 부여/회수 (set_admin)
 *   2. 업체 영구 삭제 (admin:business:delete)
 *   3. 사용자 영구 삭제 (admin:user:delete)
 *   4. FAQ 수정 (admin:faq:write)
 *   5. 에러 로그 전체 비우기 (admin:error_log:clear_all)
 *   6. 메모 일괄삭제 (admin:memo:bulk_delete)
 *   7. 휴지통 영구 삭제 (admin:trash:purge)
 *   8. 메시지 일괄삭제 (admin:room:msg_bulk_delete)
 *
 * CLAUDE.md "사장님 권한 자동 변경 절대 금지" 룰 — 권한 변경은 owner 가 UI 클릭만.
 *
 * SSOT (Single Source of Truth):
 *   - 백엔드 (tRPC withPermission) + 프론트 (can) + 옛 admin.html (permissions.json inject)
 *     모두 이 PERMISSIONS map 1곳 참조 → 동기화 사고 0
 */

export type Role = 'owner' | 'admin' | 'customer';

export interface UserContext {
  userId: number | null;
  isAdmin: boolean;
  isOwner: boolean;
  approvalStatus: string | null;
}

/**
 * DB row → role 계산. 사장님 결정 2026-05-11: staff_role 컬럼 deprecated (사용 X).
 */
export function calculateRole(user: {
  is_admin?: number | null;
  is_owner?: number | null;
}): Role {
  if (user.is_owner === 1) return 'owner';
  if (user.is_admin === 1) return 'admin';
  return 'customer';
}

/** 권한 위계: owner > admin > customer. */
export function hasRole(userRole: Role, requiredRole: Role): boolean {
  const order: Role[] = ['customer', 'admin', 'owner'];
  return order.indexOf(userRole) >= order.indexOf(requiredRole);
}

/**
 * 권한 catalog — SSOT.
 *
 * 'owner' = 사장님만
 * 'admin' = 직원 + 사장님
 * 'customer' = 모두
 */
export const PERMISSIONS = {
  // === Owner only — 사장님 명시 결정 2026-05-11 (8개) ===
  'admin:user:set_admin': 'owner' as Role,                  // admin 권한 부여/회수
  'admin:business:delete': 'owner' as Role,                 // 업체 영구 삭제
  'admin:user:delete': 'owner' as Role,                     // 사용자 영구 삭제
  'admin:faq:write': 'owner' as Role,                       // FAQ 수정 (정확성 최우선 룰)
  'admin:error_log:clear_all': 'owner' as Role,             // 에러 로그 전체 비우기
  'admin:memo:bulk_delete': 'owner' as Role,                // 메모 일괄삭제
  'admin:trash:purge': 'owner' as Role,                     // 휴지통 영구 삭제
  'admin:room:msg_bulk_delete': 'owner' as Role,            // 메시지 일괄삭제

  // === Admin (직원 + 사장님) ===
  'admin:internal:read': 'admin' as Role,                   // 관리자방 진입
  'admin:user:approve': 'admin' as Role,                    // 사용자 승인/거절 (status 변경)
  'admin:user:read': 'admin' as Role,                       // 사용자 조회
  'admin:business:read': 'admin' as Role,                   // 업체 조회
  'admin:business:write': 'admin' as Role,                  // 업체 정보 수정 (14필드)
  'admin:business:status': 'admin' as Role,                 // 업체 status 변경 (활성/폐업/종료)
  'admin:room:read': 'admin' as Role,                       // 상담방 조회
  'admin:room:send': 'admin' as Role,                       // 메시지 전송
  'admin:room:close': 'admin' as Role,                      // 상담방 close/reopen
  'admin:memo:write': 'admin' as Role,                      // 메모 작성/단건 삭제
  'admin:doc:approve': 'admin' as Role,                     // 영수증 개별 승인/반려
  'admin:bulk_send': 'admin' as Role,                       // 단체발송 (사장님 결정 2026-05-11)
  'admin:filing:write': 'admin' as Role,                    // 신고 검토표 작성/결재
  'admin:search:global': 'admin' as Role,                   // 전역 검색
  'admin:review:read': 'admin' as Role,                     // AI 답변 검증 조회
  'admin:trash:restore': 'admin' as Role,                   // 휴지통 복원 (단건)

  // === Customer ===
  'customer:chat': 'customer' as Role,
  'customer:upload_doc': 'customer' as Role,
  'customer:mypage': 'customer' as Role,
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

/**
 * Owner-only 권한 목록 (사장님 결정 2026-05-11 기준 8개).
 * 옛 admin.html UI 에서 hide / disable 용.
 */
export function ownerOnlyPermissions(): Permission[] {
  return Object.entries(PERMISSIONS)
    .filter(([, role]) => role === 'owner')
    .map(([key]) => key as Permission);
}

/**
 * permissions.json export — build 시 옛 admin.html 이 inject.
 * 옛/새 시스템 SSOT.
 */
export function exportPermissionsJson(): Record<string, Role> {
  return Object.fromEntries(Object.entries(PERMISSIONS));
}
