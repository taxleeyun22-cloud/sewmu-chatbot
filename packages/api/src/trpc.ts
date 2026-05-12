/**
 * Phase Next-Week2 Day 4 (2026-05-09): tRPC root.
 *
 * Cloudflare Workers 호환 (D1 binding 자동 inject).
 */
import { initTRPC, TRPCError } from '@trpc/server';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { AuthContext } from '@sewmu/auth';
import { calculateRole, can, hasRole, type Role, type Permission } from '@sewmu/auth';

export interface Context {
  /** Cloudflare D1 binding */
  db: D1Database;
  /** Cloudflare R2 binding (optional — 옛 admin 일부 endpoint 만 사용) */
  bucket?: R2Bucket;
  /** OpenAI API key */
  openaiApiKey?: string;
  /** 인증 정보 (adminRole 포함 — 노션 5단계) */
  auth: AuthContext;
  /**
   * Phase 12 (2026-05-12): request 추적 ID.
   * Cloudflare 의 `cf-ray` 헤더 (또는 자체 생성) — fetchHandler 가 inject.
   * 로그/Sentry 의 모든 entry 에 자동 첨부 → 사장님이 "이 시점에 났어요" 할 때
   * Cloudflare 대시보드 logs 에서 정확한 trace 찾기 가능.
   */
  requestId?: string;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;

/**
 * 전 procedure 공통 — uncaught error 자동 구조화 로깅 (Logpush/Sentry).
 * 각 라우터에서 반복 try/catch + logger.error 작성 불필요.
 *
 * 단, TRPCError (input/unauth/forbidden 등 의도적 throw) 는 비즈니스 흐름이라 log 안 함.
 */
const errorLoggingMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  try {
    return await next();
  } catch (err) {
    /* TRPCError 는 사장님 결정 흐름 (UNAUTHORIZED 등) — log 안 함, 그대로 throw */
    if (err instanceof TRPCError) throw err;
    /* dynamic import 로 logger 순환 의존 회피 */
    const { logger, logCtx } = await import('./logger');
    logger.error(
      `tRPC ${type} uncaught error`,
      logCtx(ctx, path),
      err,
    );
    throw err;
  }
});

export const publicProcedure = t.procedure.use(errorLoggingMiddleware);

/** ctx.auth → role 계산 (admin_role 우선, fallback is_owner/is_admin). */
function ctxRole(auth: AuthContext): Role {
  if (auth.adminRole) return auth.adminRole as Role;
  return calculateRole({
    is_owner: auth.isOwner ? 1 : 0,
    is_admin: auth.isAdmin ? 1 : 0,
  });
}

/**
 * adminProcedure — admin 이상 (admin/owner) 통과. editor/viewer 차단.
 */
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  const role = ctxRole(ctx.auth);
  if (!hasRole(role, 'admin')) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx });
});

/**
 * editorProcedure — editor 이상 (editor/admin/owner) 통과. viewer 차단.
 * 사용처: 메모/문서/메시지 작성, 신고 작성, 휴지통 복원
 */
export const editorProcedure = t.procedure.use(async ({ ctx, next }) => {
  const role = ctxRole(ctx.auth);
  if (!hasRole(role, 'editor')) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx });
});

/**
 * viewerProcedure — viewer 이상 (viewer/editor/admin/owner) 통과. customer 차단.
 * 사용처: 사용자/업체/상담방 list, 대시보드 counts, 검색
 */
export const viewerProcedure = t.procedure.use(async ({ ctx, next }) => {
  const role = ctxRole(ctx.auth);
  if (!hasRole(role, 'viewer')) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx });
});

/**
 * ownerProcedure — 사장님 only.
 */
export const ownerProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.auth.isOwner) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'owner only' });
  }
  return next({ ctx });
});

/**
 * customerProcedure — 카카오 로그인 사용자.
 */
export const customerProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.auth.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx });
});

/**
 * permission-based procedure — 특정 권한 필요.
 */
export function withPermission(permission: Permission) {
  return t.procedure.use(async ({ ctx, next }) => {
    /* 사장님 결정 2026-05-11: 3단계 (owner/admin/customer). staffRole deprecated. */
    const role: Role = ctx.auth.isOwner ? 'owner' : ctx.auth.isAdmin ? 'admin' : 'customer';
    if (!can(role, permission)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Permission ${permission} requires ${role}+`,
      });
    }
    return next({ ctx });
  });
}
