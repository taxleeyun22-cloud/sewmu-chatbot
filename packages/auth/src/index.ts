/**
 * Phase Next-1.5 (2026-05-09): @sewmu/auth (placeholder — Week 2 에서 본격).
 *
 * Week 2 도입 예정:
 *   - Auth.js v5 (NextAuth)
 *   - Providers: Kakao + Naver + Apple (iOS App Store 4.1.1 준수)
 *   - Drizzle adapter (sessions / accounts 테이블)
 *   - RBAC: owner / manager / staff / customer
 *   - middleware: 권한 체크 자동
 *
 * 현재: ADMIN_KEY 단일 신뢰점 (CLAUDE.md 룰)
 *   - functions/api/_adminAuth.js — owner/admin 분기
 *   - functions/api/_authz.js — RBAC 도입 시작 (Phase #10)
 *   - 점진 마이그레이션 (Week 4-5 admin 작업 시 본격)
 */

export interface AuthContext {
  userId: number | null;
  isOwner: boolean;
  isAdmin: boolean;
  staffRole: 'owner' | 'manager' | 'staff' | null;
}

/** placeholder — Week 2 에서 실제 Auth.js 호출 */
export function getAuthContext(): AuthContext {
  return {
    userId: null,
    isOwner: false,
    isAdmin: false,
    staffRole: null,
  };
}
