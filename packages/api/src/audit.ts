/**
 * Phase Next-Day27 (2026-05-11): Audit log helper.
 *
 * 사용 (라우터 내부):
 *   import { audit } from '../audit';
 *   await audit(ctx, 'admin:user:set_admin', { target_type: 'user', target_id: 5, after: { is_admin: 1 } });
 *
 * 산업 표준 (Stripe / Notion / GitHub) 패턴.
 */
import type { Context } from './trpc';
import type { Permission } from '@sewmu/auth';
import { calculateRole } from '@sewmu/auth';
import { drizzle, schema } from '@sewmu/db/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AuditOptions {
  target_type?: 'user' | 'business' | 'memo' | 'filing' | 'document' | 'room' | 'faq' | 'error_log';
  target_id?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  result?: 'success' | 'failure' | 'forbidden';
  error_message?: string;
}

/**
 * mutation 후 호출 — 자동 1줄 audit_logs INSERT.
 * 실패해도 본 mutation 영향 X (graceful).
 */
export async function audit(
  ctx: Context,
  action: Permission | string,
  options: AuditOptions = {},
): Promise<void> {
  if (!ctx.auth.userId) return; // 비로그인은 audit 안 함 (publicProcedure는 별도)
  try {
    const db = drizzle(ctx.db);
    const { auditLogs } = schema;

    const role = calculateRole({
      is_admin: ctx.auth.isAdmin ? 1 : 0,
      is_owner: ctx.auth.isOwner ? 1 : 0,
    });

    await db.insert(auditLogs).values({
      actor_user_id: ctx.auth.userId,
      actor_role: role,
      action,
      target_type: options.target_type ?? null,
      target_id: options.target_id ?? null,
      before: options.before ? JSON.stringify(options.before) : null,
      after: options.after ? JSON.stringify(options.after) : null,
      result: options.result ?? 'success',
      error_message: options.error_message ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* audit 실패 = 본 작업 영향 X. 단, 추후 모니터링 필요. */
  }
}
