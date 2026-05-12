/**
 * Phase Next-Day29 (2026-05-12) + cleanup Phase 10 (2026-05-12):
 * 구조화 에러 로깅 (Sentry-ready).
 *
 * 사장님 명령 "구글 수준" — Stripe / Notion / GitHub 패턴.
 *
 * 설계:
 * - logger.info / warn / error → console 구조화 JSON 출력
 * - Cloudflare Workers Logpush 가 자동 수집 → BigQuery / R2 적재
 * - 향후 Sentry @sentry/cloudflare 도입 시 transport 만 교체
 * - schemaVersion 으로 향후 포맷 변경 추적
 * - LOG_LEVEL env 로 debug 억제 (prod 비용 절약)
 */
import type { Context } from './trpc';
import { calculateRole } from '@sewmu/auth';

const LOG_SCHEMA_VERSION = 1;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/**
 * 환경변수 LOG_LEVEL (default 'info' for prod, 'debug' for dev).
 * Cloudflare Workers env 에서 직접 set 불가하므로 process.env 기준
 * (vitest / node) + globalThis 기준 (Workers) 둘 다 체크.
 */
function currentLogLevel(): LogLevel {
  const v =
    (typeof process !== 'undefined' && process.env?.LOG_LEVEL) ||
    (typeof globalThis !== 'undefined' &&
      (globalThis as { LOG_LEVEL?: string }).LOG_LEVEL) ||
    'info';
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error' || v === 'fatal') {
    return v;
  }
  return 'info';
}

export interface LogContext {
  /** tRPC procedure 경로 (예: 'users.setStatus') */
  procedure?: string;
  /** 행위자 user_id */
  userId?: number | null;
  /** 행위자 역할 (owner/admin/editor/viewer/customer) */
  role?: string;
  /** request id (Cloudflare cf-ray 또는 자체 생성). 추후 plumbing 예정. */
  requestId?: string;
  /** 임의 메타 — PII 금지 (사용자 입력 직접 포함 X) */
  meta?: Record<string, unknown>;
}

export interface LogEntry extends LogContext {
  level: LogLevel;
  message: string;
  timestamp: string;
  schemaVersion: number;
  /** Error 직렬화 — error/fatal 시 자동 */
  error?: {
    name: string;
    message: string;
    stack?: string;
    cause?: string;
  };
}

/**
 * circular reference 안전 JSON.stringify — Node 22 / Workers / Bun 모두 동일.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val as object)) return '[Circular]';
      seen.add(val as object);
    }
    if (typeof val === 'bigint') return val.toString();
    return val;
  });
}

/**
 * 1줄 구조화 로그 — Cloudflare Workers console 이 JSON 그대로 stdout 으로 보냄.
 * fallback 도 구조화 유지 (level/timestamp/message 보존).
 */
function emit(entry: LogEntry): void {
  /* Cloudflare Workers — console.log/warn/error 가 Logpush 로 수집됨 */
  const fn =
    entry.level === 'error' || entry.level === 'fatal'
      ? console.error
      : entry.level === 'warn'
      ? console.warn
      : console.log;
  let out: string;
  try {
    out = safeStringify(entry);
  } catch {
    /* 최후 fallback — level/timestamp 만이라도 보존 */
    out = `{"level":"${entry.level}","timestamp":"${entry.timestamp}","message":${JSON.stringify(entry.message ?? '')},"schemaVersion":${LOG_SCHEMA_VERSION},"_fallback":1}`;
  }
  fn(out);
}

function buildEntry(level: LogLevel, message: string, ctx: LogContext = {}, err?: unknown): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    schemaVersion: LOG_SCHEMA_VERSION,
    ...ctx,
  };
  if (err) {
    if (err instanceof Error) {
      entry.error = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
      /* Node 16+ Error.cause */
      const cause = (err as { cause?: unknown }).cause;
      if (cause) {
        entry.error.cause = cause instanceof Error ? cause.message : String(cause);
      }
    } else {
      entry.error = { name: 'NonError', message: String(err) };
    }
  }
  return entry;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[currentLogLevel()];
}

export const logger = {
  debug(message: string, ctx?: LogContext): void {
    if (!shouldLog('debug')) return;
    emit(buildEntry('debug', message, ctx));
  },
  info(message: string, ctx?: LogContext): void {
    if (!shouldLog('info')) return;
    emit(buildEntry('info', message, ctx));
  },
  warn(message: string, ctx?: LogContext, err?: unknown): void {
    if (!shouldLog('warn')) return;
    emit(buildEntry('warn', message, ctx, err));
  },
  error(message: string, ctx?: LogContext, err?: unknown): void {
    if (!shouldLog('error')) return;
    emit(buildEntry('error', message, ctx, err));
  },
  fatal(message: string, ctx?: LogContext, err?: unknown): void {
    if (!shouldLog('fatal')) return;
    emit(buildEntry('fatal', message, ctx, err));
  },
};

/**
 * tRPC ctx → LogContext 추출 — 단일 진실 소스 (`@sewmu/auth/calculateRole` 사용).
 * 매 라우터에서 반복 작성하지 말 것.
 *
 * 사용:
 *   } catch (e) {
 *     logger.error('Failed to set user status', logCtx(ctx, 'users.setStatus'), e);
 *     throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal' });
 *   }
 */
export function logCtx(ctx: Context, procedure: string, meta?: Record<string, unknown>): LogContext {
  /* adminRole 우선 (Notion 5단계) — null/undefined/empty 모두 fallback */
  const adminRole = ctx.auth.adminRole ?? '';
  const role = adminRole
    ? adminRole
    : calculateRole({
        is_owner: ctx.auth.isOwner ? 1 : 0,
        is_admin: ctx.auth.isAdmin ? 1 : 0,
      });
  return {
    procedure,
    userId: ctx.auth.userId ?? null,
    role,
    meta,
  };
}
