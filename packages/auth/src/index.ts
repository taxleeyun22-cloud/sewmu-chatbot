/**
 * Phase Next-Week2 Day 3 (2026-05-09): @sewmu/auth — Auth.js v5 + RBAC.
 *
 * 사용:
 *   import { kakaoProvider, naverProvider, calculateRole, can } from '@sewmu/auth';
 */
export { kakaoProvider } from './providers/kakao';
export { naverProvider } from './providers/naver';
export type { KakaoProfile } from './providers/kakao';
export type { NaverProfile } from './providers/naver';
export { buildAuthConfig, buildAuthConfigSimple } from './config';
export { DrizzleD1Adapter } from './drizzle-adapter';

export {
  calculateRole,
  hasRole,
  can,
  PERMISSIONS,
  ownerOnlyPermissions,
  exportPermissionsJson,
  type Role,
  type UserContext,
  type Permission,
} from './rbac';

/**
 * 인증 context — tRPC ctx.auth 에 inject.
 *
 * 사장님 결정 2026-05-11: 3단계 (owner/admin/customer).
 * staffRole 컬럼은 schema 에 남겨두되 사용 X (legacy).
 */
export interface AuthContext {
  userId: number | null;
  isOwner: boolean;
  isAdmin: boolean;
  /** @deprecated 2026-05-11 — 매니저/스태프 통합. 호환 위해 남겨둠. */
  staffRole?: string | null;
}

export function getAuthContext(): AuthContext {
  return {
    userId: null,
    isOwner: false,
    isAdmin: false,
  };
}
