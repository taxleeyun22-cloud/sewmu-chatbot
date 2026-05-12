/**
 * Phase Next-Day29 (2026-05-12): RBAC 5단계 (사장님 명령 "노션처럼 권한 줄임").
 *
 * 노션 패턴 Role (위계): owner > admin > editor > viewer > customer
 *   - owner: 사장님 (이재윤) — 전부
 *   - admin: 정직원 관리자 — 거의 전부 (owner-only 8개 제외)
 *   - editor: 메모/문서/대화 수정 가능, 사용자/업체 status 변경 X
 *   - viewer: 읽기 전용 (모든 list / detail 조회만)
 *   - customer: 거래처 (마이페이지 + 챗봇)
 *
 * SSOT (Single Source of Truth):
 *   - 백엔드 (tRPC withPermission) + 프론트 (can) + 옛 admin.html (permissions.json inject)
 *     모두 이 PERMISSIONS map 1곳 참조 → 동기화 사고 0
 */

export type Role = 'owner' | 'admin' | 'editor' | 'viewer' | 'customer';

export interface UserContext {
  userId: number | null;
  isAdmin: boolean;
  isOwner: boolean;
  adminRole?: Role | null;
  approvalStatus: string | null;
}

/**
 * DB row → role 계산.
 * 우선순위: admin_role 컬럼 (명시 지정) > is_owner > is_admin
 */
export function calculateRole(user: {
  is_admin?: number | null;
  is_owner?: number | null;
  admin_role?: string | null;
}): Role {
  /* 사장님 결정 2026-05-12: admin_role 컬럼 우선 (노션 5단계).
   * 사장님이 직원의 권한을 직접 'editor' 또는 'viewer' 로 지정 가능. */
  if (user.admin_role === 'owner') return 'owner';
  if (user.admin_role === 'admin') return 'admin';
  if (user.admin_role === 'editor') return 'editor';
  if (user.admin_role === 'viewer') return 'viewer';
  /* admin_role 미지정 시 옛 컬럼 (is_owner / is_admin) 호환 */
  if (user.is_owner === 1) return 'owner';
  if (user.is_admin === 1) return 'admin';
  return 'customer';
}

/** 권한 위계 — 5단계 (owner 최고 / customer 최저). */
const ROLE_ORDER: Role[] = ['customer', 'viewer', 'editor', 'admin', 'owner'];

export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(requiredRole);
}

/**
 * 권한 catalog — SSOT.
 *
 *   'owner' = 사장님만
 *   'admin' = 정직원 관리자 + 사장님
 *   'editor' = 편집 권한 (메모/문서/대화) + 사용자/업체 조회
 *   'viewer' = 모든 조회만 (mutation X)
 *   'customer' = 거래처 자기 데이터만
 */
export const PERMISSIONS = {
  // === Owner only (8개) — 사장님 명시 결정 2026-05-11 ===
  'admin:user:set_admin': 'owner' as Role,                  // admin 권한 부여/회수
  'admin:user:set_role': 'owner' as Role,                   // admin_role 변경 (노션 권한 단계)
  'admin:business:delete': 'owner' as Role,                 // 업체 영구 삭제
  'admin:user:delete': 'owner' as Role,                     // 사용자 영구 삭제
  'admin:faq:write': 'owner' as Role,                       // FAQ 수정 (정확성 최우선)
  'admin:error_log:clear_all': 'owner' as Role,             // 에러 로그 전체 비우기
  'admin:memo:bulk_delete': 'owner' as Role,                // 메모 일괄삭제
  'admin:trash:purge': 'owner' as Role,                     // 휴지통 영구 삭제
  'admin:room:msg_bulk_delete': 'owner' as Role,            // 메시지 일괄삭제

  // === Admin (정직원 + owner) ===
  'admin:internal:read': 'admin' as Role,                   // 관리자방 진입
  'admin:user:approve': 'admin' as Role,                    // 사용자 승인/거절
  'admin:user:write': 'admin' as Role,                      // 사용자 정보 수정
  'admin:business:write': 'admin' as Role,                  // 업체 정보 수정 (14필드)
  'admin:business:status': 'admin' as Role,                 // 업체 상태 변경
  'admin:room:close': 'admin' as Role,                      // 상담방 close/reopen
  'admin:bulk_send': 'admin' as Role,                       // 단체발송
  'admin:filing:approve': 'admin' as Role,                  // 신고 결재

  // === Editor (편집 가능 — admin 아래 단계) ===
  'admin:room:send': 'editor' as Role,                      // 메시지 전송 (editor 이상)
  'admin:memo:write': 'editor' as Role,                     // 메모 작성/단건 삭제
  'admin:doc:approve': 'editor' as Role,                    // 영수증 개별 승인/반려
  'admin:filing:write': 'editor' as Role,                   // 신고 검토표 작성
  'admin:trash:restore': 'editor' as Role,                  // 휴지통 복원 (단건)

  // === Viewer (조회만) ===
  'admin:user:read': 'viewer' as Role,                      // 사용자 조회
  'admin:business:read': 'viewer' as Role,                  // 업체 조회
  'admin:room:read': 'viewer' as Role,                      // 상담방 조회
  'admin:search:global': 'viewer' as Role,                  // 전역 검색
  'admin:review:read': 'viewer' as Role,                    // AI 답변 검증 조회
  'admin:memo:read': 'viewer' as Role,                      // 메모 조회
  'admin:doc:read': 'viewer' as Role,                       // 문서 조회
  'admin:filing:read': 'viewer' as Role,                    // 신고 조회
  'admin:dashboard:read': 'viewer' as Role,                 // 대시보드 카운트

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
 * Owner-only 권한 목록 — UI 에서 hide / disable 용.
 */
export function ownerOnlyPermissions(): Permission[] {
  return Object.entries(PERMISSIONS)
    .filter(([, role]) => role === 'owner')
    .map(([key]) => key as Permission);
}

/**
 * Role 한국어 라벨 — 사용자 UI 표시용.
 */
export function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    owner: '👑 사장님',
    admin: '🛡️ 관리자',
    editor: '✏️ 편집자',
    viewer: '👀 뷰어',
    customer: '🏢 거래처',
  };
  return labels[role] || role;
}

/**
 * permissions.json export — build 시 옛 admin.html 이 inject.
 * 옛/새 시스템 SSOT.
 */
export function exportPermissionsJson(): Record<string, Role> {
  return Object.fromEntries(Object.entries(PERMISSIONS));
}
