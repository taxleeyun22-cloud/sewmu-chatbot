/**
 * Phase #3 적용 확장 (2026-05-06): admin.js / admin-*.js 노출 함수·변수 type 정의.
 *
 * 목적:
 *   - admin.js (4500+줄) classic script 가 노출하는 모든 함수·전역 변수를
 *     TypeScript 가 인식 → src/* 의 .ts 모듈이 admin 함수 호출 시 type 검증.
 *   - admin.js 통째 .ts 변환 (4500줄, 1-2주 작업) 전 단계 — 점진 마이그레이션.
 *   - 새 코드 작성 시 IDE 자동완성 + 컴파일 에러 발견.
 *
 * 사용 (TypeScript .ts 파일):
 *   declare const KEY: string;          // → window.KEY 자동 인식
 *   declare function tab(name: string): void;
 *
 * 또는 .ts 안에서:
 *   if (typeof window !== 'undefined') {
 *     window.openCustomerDashboard?.(64);  // type-safe
 *   }
 *
 * 향후 (사장님 결정 후):
 *   - admin.js → admin.ts 통째 변환 (4500줄)
 *   - admin-memos.js / admin-customer-dash.js 등 점진 .ts
 *   - 모든 cross-script global → typed
 */

/* ============================================================
 * 전역 변수 (admin.js / admin-*.js 정의)
 * ============================================================ */

declare global {
  /* === 인증 / 권한 === */
  /** ADMIN_KEY (사장님 토큰) — admin.js 정의 */
  let KEY: string;
  /** 사장님 (ADMIN_KEY 또는 user_id=1 + is_admin=1) — admin.js 정의 */
  let IS_OWNER: boolean;
  /** 사업장 관리자 (is_admin=1 + staff_role='manager') — admin.js Phase #10 */
  let IS_MANAGER: boolean;
  /** 일반 admin (is_admin=1 default) — admin.js Phase #10 */
  let IS_STAFF: boolean;

  /* === 상담방 (admin-rooms-list.js) === */
  /** 현재 열려있는 상담방 ID */
  let currentRoomId: string | null;
  /** 현재 상담방 상태 ('active' | 'closed') */
  let currentRoomStatus: 'active' | 'closed';
  /** 현재 상담방 직통번호 */
  let currentRoomPhone: string | null;
  /** 현재 상담방 멤버 list */
  let currentRoomMembers: Array<{ user_id: number; name: string; role: string }>;
  /** 상담방 모드 ('external' | 'internal') */
  let _roomsMode: 'external' | 'internal';

  /* === 거래처 dashboard (admin-customer-dash.js) === */
  /** 현재 열린 거래처 dashboard 의 user_id */
  let _cdCurrentUserId: number | null;
  /** 거래처 dashboard 메모 캐시 */
  let _cdMemosCache: Array<Record<string, unknown>>;
  /** 거래처 dashboard 카테고리 필터 */
  let _cdMemoCategory: string;

  /* === 메모 (admin-memos.js / admin.js loadRoomMemos) === */
  /** 상담방 메모 캐시 */
  let _memoCache: Array<Record<string, unknown>>;
  /** 상담방 메모 필터 ('todo' | 'ref' | 'done' | 'all') */
  let _memoFilter: 'todo' | 'ref' | 'done' | 'all';

  /* === 사용자 탭 (admin-users-tab.js) === */
  /** 사용자 status 필터 ('pending' | 'approved_client' | 'rejected' | 'terminated' | 'admin') */
  let currentStatus: 'pending' | 'approved_client' | 'approved_guest' | 'rejected' | 'terminated' | 'admin';

  /* ============================================================
   * Helper 함수 (admin.js 정의)
   * ============================================================ */

  /** HTML escape (XSS 방어) */
  function e(s: string | null | undefined): string;
  /** Attribute escape (속성 안전) */
  function escAttr(s: string | null | undefined): string;
  /** null-safe getElementById (없으면 no-op 객체) */
  function $g(id: string): HTMLElement;

  /* ============================================================
   * Tab 전환 (admin.js)
   * ============================================================ */

  /** admin 탭 전환 — 'chat' | 'live' | 'rooms' | 'users' | 'docs' | 'anal' | 'review' | 'faq' | 'internal' */
  function tab(name: string): void;
  /** 사용자 status 탭 전환 */
  function setClientTabMode(mode: 'user' | 'business'): void;

  /* ============================================================
   * 거래처 dashboard (admin-customer-dash.js)
   * ============================================================ */

  /** 거래처 dashboard 모달 열기 (deep link 지원) */
  function openCustomerDashboard(
    userId: number,
    opts?: { fromPopstate?: boolean }
  ): Promise<void>;
  /** 거래처 dashboard 모달 닫기 */
  function closeCustomerDashboard(opts?: { fromPopstate?: boolean }): void;

  /* ============================================================
   * 상담방 (admin-rooms-list.js)
   * ============================================================ */

  /** 상담방 진입 (deep link 지원) */
  function openRoom(roomId: string, opts?: { fromPopstate?: boolean }): Promise<void>;
  /** 상담방 list 로드 */
  function loadRoomList(): Promise<void>;
  /** 상담방 상세 로드 */
  function loadRoomDetail(): Promise<void>;

  /* ============================================================
   * 메모 (admin-memos.js)
   * ============================================================ */

  /** 거래처 dashboard 통합 메모 로드 */
  function _loadCdAllMemos(userId: number): Promise<void>;
  /** 메모 카테고리 필터 (cdMemoFilter) */
  function cdMemoFilter(category: string): void;
  /** 메모 추가 */
  function addCdMemo(): Promise<void>;
  /** 메모 삭제 (soft) */
  function deleteCdMemo(id: number): Promise<void>;

  /* ============================================================
   * 사이드바 카운트 (admin.js)
   * ============================================================ */

  /** 사이드바 카운트 일괄 갱신 */
  function refreshSidebarCounts(): void;
  /** pending 카운트 갱신 */
  function refreshPendingBadge(): Promise<void>;

  /* ============================================================
   * 에러 로그 (admin.js Phase #11)
   * ============================================================ */

  function openErrorLog(): void;
  function closeErrorLog(): void;
  function loadErrorLog(): Promise<void>;
  function purgeOldErrorLogs(): Promise<void>;
  function purgeAllErrorLogs(): Promise<void>;

  /* ============================================================
   * 권한 변경 (admin-users-tab.js Phase #10)
   * ============================================================ */

  function setAdminFlag(userId: number, flag: 0 | 1): Promise<void>;
  function setStaffRole(
    userId: number,
    role: 'manager' | 'staff' | null
  ): Promise<void>;

  /* ============================================================
   * 검색·단체발송 (admin-search-bulk.js)
   * ============================================================ */

  function openSearch(): void;
  function openBulkSend(): void;

  /* ============================================================
   * 메모 모달 (admin.js)
   * ============================================================ */

  function openMyTodos(): void;
  function openTrash(): void;
  function openTerminationRequests(): void;
}

/* TypeScript 가 이 파일을 module 로 인식 — declare global 활성화 */
export {};
