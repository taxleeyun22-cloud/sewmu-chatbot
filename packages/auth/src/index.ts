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
  type Role,
  type UserContext,
  type Permission,
} from './rbac';

export interface AuthContext {
  userId: number | null;
  isOwner: boolean;
  isAdmin: boolean;
  staffRole: 'owner' | 'manager' | 'staff' | null;
}

export function getAuthContext(): AuthContext {
  // Week 2 Day 3 본격 — Auth.js session 호출
  return {
    userId: null,
    isOwner: false,
    isAdmin: false,
    staffRole: null,
  };
}
