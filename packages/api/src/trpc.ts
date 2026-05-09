/**
 * Phase Next-Week2 Day 4 (2026-05-09): tRPC root.
 *
 * Cloudflare Workers 호환 (D1 binding 자동 inject).
 */
import { initTRPC, TRPCError } from '@trpc/server';
import type { AuthContext } from '@sewmu/auth';
import { calculateRole, can, type Role, type Permission } from '@sewmu/auth';

export interface Context {
  /** Cloudflare D1 binding */
  db: any; // D1Database (workspace 호환)
  /** Cloudflare R2 binding */
  bucket?: any;
  /** OpenAI API key */
  openaiApiKey?: string;
  /** 인증 정보 */
  auth: AuthContext;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * adminProcedure — staff 이상만 통과.
 */
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.auth.isAdmin && !ctx.auth.isOwner) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx });
});

/**
 * ownerProcedure — sajang nim only.
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
    const role: Role = ctx.auth.isOwner
      ? 'owner'
      : ctx.auth.isAdmin
        ? ctx.auth.staffRole === 'manager'
          ? 'manager'
          : 'staff'
        : 'customer';
    if (!can(role, permission)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Permission ${permission} requires ${role}+`,
      });
    }
    return next({ ctx });
  });
}
