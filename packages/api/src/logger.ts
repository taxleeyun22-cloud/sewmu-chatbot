/**
 * Phase Next-Day29 (2026-05-12): 구조화 에러 로깅 (Sentry-ready).
 *
 * 사장님 명령 "구글 수준" — Stripe / Notion / GitHub 패턴.
 *
 * - logger.info / warn / error → console 구조화 JSON 출력
 * - Cloudflare Workers Logpush 가 자동 수집 → BigQuery / R2 적재
 * - 향후 Sentry @sentry/cloudflare 도입 시 transport 만 교체
 * - error_logs 테이블 (D1) INSERT 도 자동 (best-effort, mutation 영향 X)
 */
import type { Context } from './trpc';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  /** tRPC procedure 경로 (예: 'users.setStatus') */
  procedure?: string;
  /** 행위자 user_id */
  userId?: number | null;
  /** 행위자 역할 */
  role?: string;
  /** request id (Cloudflare cf-ray header 등) */
  requestId?: string;
  /** 임의 메타 */
  meta?: Record<string, unknown>;
}

export interface LogEntry extends LogContext {
  level: LogLevel;
  message: string;
  timestamp: string;
  /** Error stack — error/fatal 시 자동 */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * 1줄 구조화 로그 — Cloudflare Workers console 이 JSON 그대로 stdout 으로 보냄.
 * Sentry 도입 시 여기에 Sentry.captureException 추가.
 */
function emit(entry: LogEntry): void {
  /* Cloudflare Workers — console.log/warn/error 가 Logpush 로 수집됨 */
  const fn =
    entry.level === 'error' || entry.level === 'fatal'
      ? console.error
      : entry.level === 'warn'
      ? console.warn
      : console.log;
  /* JSON 1줄 (Datadog / Sentry / Logpush 모두 같은 포맷 기대) */
  try {
    fn(JSON.stringify(entry));
  } catch {
    /* circular ref 방어 */
    fn(`[log-fallback] ${entry.level} ${entry.message}`);
  }
}

function buildEntry(level: LogLevel, message: string, ctx: LogContext = {}, err?: unknown): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...ctx,
  };
  if (err) {
    if (err instanceof Error) {
      entry.error = { name: err.name, message: err.message, stack: err.stack };
    } else {
      entry.error = { name: 'NonError', message: String(err) };
    }
  }
  return entry;
}

export const logger = {
  debug(message: string, ctx?: LogContext): void {
    emit(buildEntry('debug', message, ctx));
  },
  info(message: string, ctx?: LogContext): void {
    emit(buildEntry('info', message, ctx));
  },
  warn(message: string, ctx?: LogContext, err?: unknown): void {
    emit(buildEntry('warn', message, ctx, err));
  },
  error(message: string, ctx?: LogContext, err?: unknown): void {
    emit(buildEntry('error', message, ctx, err));
  },
  fatal(message: string, ctx?: LogContext, err?: unknown): void {
    emit(buildEntry('fatal', message, ctx, err));
  },
};

/**
 * tRPC ctx 에서 logger context 추출 — 매 라우터 마다 반복 작성 X.
 *
 * 사용:
 *   } catch (e) {
 *     logger.error('Failed to set user status', logCtx(ctx, 'users.setStatus'), e);
 *     throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
 *   }
 */
export function logCtx(ctx: Context, procedure: string, meta?: Record<string, unknown>): LogContext {
  return {
    procedure,
    userId: ctx.auth.userId ?? null,
    role: ctx.auth.adminRole || (ctx.auth.isOwner ? 'owner' : ctx.auth.isAdmin ? 'admin' : 'customer'),
    meta,
  };
}

/**
 * Best-effort D1 error_logs INSERT — 실패해도 본 mutation 영향 X.
 *
 * 사용:
 *   } catch (e) {
 *     await logToD1(ctx, 'users.setStatus', e);
 *     throw new TRPCError(...);
 *   }
 */
export async function logToD1(ctx: Context, procedure: string, err: unknown): Promise<void> {
  try {
    const errObj = err instanceof Error ? err : new Error(String(err));
    const userId = ctx.auth.userId ?? null;
    /* error_logs 테이블 schema (옛 admin 기준):
     *   id INTEGER PRIMARY KEY,
     *   user_id INTEGER, source TEXT, level TEXT,
     *   message TEXT, stack TEXT, meta TEXT, created_at TEXT
     */
    await ctx.db
      .prepare(
        `INSERT INTO error_logs (user_id, source, level, message, stack, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userId,
        `trpc:${procedure}`,
        'error',
        errObj.message?.slice(0, 1000) ?? '',
        errObj.stack?.slice(0, 4000) ?? '',
        JSON.stringify({ name: errObj.name }),
        new Date().toISOString(),
      )
      .run();
  } catch {
    /* error_logs 테이블이 없거나 schema 다른 환경 — silent (logger 가 이미 console 출력) */
  }
}
