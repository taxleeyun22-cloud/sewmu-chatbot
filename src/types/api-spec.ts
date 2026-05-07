/**
 * Phase #9 (2026-05-06): API 스펙 — OpenAPI 3.0 호환 타입 정의.
 *
 * functions/api/ 100+ endpoint 의 request/response 형식 단일 진실의 원천.
 * 향후:
 *   - 외부 시스템 연동 (홈택스 / 위하고 / 회계 프로그램) 시 이 스펙 사용
 *   - Swagger UI / Redoc 자동 생성 가능
 *   - SDK 자동 생성 (TypeScript / Python / 등)
 *
 * 이 모듈은 type 만 export — runtime 영향 0.
 */

/* ============================================================
 * 공통 응답 형식
 * ============================================================ */

export interface ApiSuccessBase {
  ok: true;
}

export interface ApiErrorBase {
  ok: false;
  error: string;
  /** HTTP status code (응답 헤더와 별도로 body 에 포함될 수 있음) */
  status?: number;
}

export type ApiResponse<T> = (T & ApiSuccessBase) | ApiErrorBase;

/* ============================================================
 * /api/admin-whoami — Phase #10 RBAC
 * ============================================================ */

export interface WhoamiSpec {
  method: 'GET';
  path: '/api/admin-whoami';
  query: { key?: string };
  response: ApiResponse<{
    role: 'owner' | 'manager' | 'staff';
    owner: boolean;
    manager: boolean;
    userId: number | null;
  }>;
}

/* ============================================================
 * /api/admin-error-log — Phase #11
 * ============================================================ */

export interface ErrorLogPostSpec {
  method: 'POST';
  path: '/api/admin-error-log';
  body: {
    source: string;
    message: string;
    stack?: string;
    url?: string;
    ua?: string;
  };
  response: ApiResponse<Record<string, never>>;
  rateLimit: '10/min per IP';
}

export interface ErrorLogGetSpec {
  method: 'GET';
  path: '/api/admin-error-log';
  query: { key: string; limit?: number; source?: string };
  response: ApiResponse<{
    errors: Array<{
      id: number;
      created_at: string;
      source: string;
      message: string;
      stack?: string;
      url?: string;
      user_id?: number | null;
      ip?: string;
    }>;
    total: number;
  }>;
  permission: 'admin (any)';
}

export interface ErrorLogDeleteSpec {
  method: 'DELETE';
  path: '/api/admin-error-log';
  query: { key: string; all?: '1'; source?: string };
  response: ApiResponse<{ removed: number }>;
  permission: '7-day cleanup: admin / all=1: owner only / source=X: owner only';
}

/* ============================================================
 * /api/admin-users — Phase #10 set_admin / set_staff_role
 * ============================================================ */

export interface AdminUsersGetSpec {
  method: 'GET';
  path: '/api/admin-users';
  query: { key: string; action?: 'staff_list'; search?: string; sort?: 'recent' | 'joined' | 'messages'; page?: number };
  response: ApiResponse<{
    users: Array<{
      id: number;
      provider: string;
      name: string | null;
      real_name: string | null;
      phone: string | null;
      email: string | null;
      is_admin: 0 | 1;
      staff_role: 'manager' | 'staff' | null;
      created_at: string;
      last_login_at: string | null;
      message_count: number;
      last_message_at: string | null;
    }>;
    total: number;
    page: number;
    totalPages: number;
    caller_owner: boolean;
  }>;
  permission: 'admin (any)';
}

export interface SetAdminFlagSpec {
  method: 'POST';
  path: '/api/admin-users?action=set_admin';
  body: { user_id: number; is_admin: 0 | 1 };
  response: ApiResponse<{
    user_id: number;
    is_admin: 0 | 1;
    added_rooms: number;
    demoted_memberships: number;
  }>;
  permission: 'owner only';
}

export interface SetStaffRoleSpec {
  method: 'POST';
  path: '/api/admin-users?action=set_staff_role';
  body: { user_id: number; staff_role: 'manager' | 'staff' | null };
  response: ApiResponse<{ user_id: number; staff_role: 'manager' | 'staff' | null }>;
  permission: 'owner only';
}

/* ============================================================
 * /api/memos — 메모 시스템
 * ============================================================ */

export interface MemosGetSpec {
  method: 'GET';
  path: '/api/memos';
  query: {
    key: string;
    scope:
      | 'room'
      | 'room_full'
      | 'customer_info'
      | 'customer_all'
      | 'business_info'
      | 'business_all'
      | 'business_due'
      | 'my'
      | 'trash_count'
      | 'trash_list';
    room_id?: string;
    user_id?: number;
    business_id?: number;
    category?: string;
    tag?: string;
    only_mine?: '1';
  };
  response: ApiResponse<{
    memos?: Array<Record<string, unknown>>;
    count?: number;
  }>;
  permission: 'admin (any)';
}

export interface MemosPurgeSpec {
  method: 'POST';
  path: '/api/memos?action=purge';
  query: { key: string; id: number };
  response: ApiResponse<Record<string, never>>;
  permission: 'manager+ (Phase #10)';
}

/* ============================================================
 * 통합 — 모든 endpoint 스펙 list (자동 문서화 시 사용)
 * ============================================================ */

export type AllApiSpecs =
  | WhoamiSpec
  | ErrorLogPostSpec
  | ErrorLogGetSpec
  | ErrorLogDeleteSpec
  | AdminUsersGetSpec
  | SetAdminFlagSpec
  | SetStaffRoleSpec
  | MemosGetSpec
  | MemosPurgeSpec;

/* ============================================================
 * Helper — 스펙 metadata
 * ============================================================ */

export interface EndpointMetadata {
  method: string;
  path: string;
  description: string;
  permission: string;
  rateLimit?: string;
}

/** 모든 endpoint 메타데이터 list — 자동 문서화 / 모니터링 / SDK 생성. */
export const ENDPOINT_METADATA: EndpointMetadata[] = [
  {
    method: 'GET',
    path: '/api/admin-whoami',
    description: '현재 admin 의 role 조회 (owner/manager/staff)',
    permission: 'admin (any)',
  },
  {
    method: 'POST',
    path: '/api/admin-error-log',
    description: 'JS 에러 자동 수집 (인증 X, IP 분당 10건 제한)',
    permission: 'public',
    rateLimit: '10/min per IP',
  },
  {
    method: 'GET',
    path: '/api/admin-error-log',
    description: '최근 에러 로그 200건 조회',
    permission: 'admin (any)',
  },
  {
    method: 'DELETE',
    path: '/api/admin-error-log',
    description: '7일 지난 에러 자동 정리 (?all=1: 전체, owner only)',
    permission: 'admin / owner (all=1)',
  },
  {
    method: 'GET',
    path: '/api/admin-users',
    description: '사용자 list (검색 / 정렬 / 페이지)',
    permission: 'admin (any)',
  },
  {
    method: 'POST',
    path: '/api/admin-users?action=set_admin',
    description: 'is_admin 플래그 변경 + 모든 active 방 자동 join/leave',
    permission: 'owner only',
  },
  {
    method: 'POST',
    path: '/api/admin-users?action=set_staff_role',
    description: 'manager / staff / null 등급 부여',
    permission: 'owner only',
  },
  {
    method: 'POST',
    path: '/api/memos?action=purge',
    description: '메모 영구 삭제 (휴지통 → 완전 제거)',
    permission: 'manager+',
  },
];
