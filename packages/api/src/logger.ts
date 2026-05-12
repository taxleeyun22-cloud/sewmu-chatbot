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

/* ─────────────────────────────────────────────────────────────
 * Transport — Phase 12 (pluggable).
 * 기본: console (Cloudflare Workers Logpush 자동 수집).
 * 향후: Sentry/Datadog 도입 시 addTransport(sentryTransport) 호출만 추가.
 * ───────────────────────────────────────────────────────────── */

export type LogTransport = (entry: LogEntry) => void;

const transports: LogTransport[] = [];

/** Cloudflare Workers / Node stdio 기본 transport. */
const consoleTransport: LogTransport = (entry) => {
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
    /* 최후 fallback — level/timestamp/message 만이라도 보존 */
    out = `{"level":"${entry.level}","timestamp":"${entry.timestamp}","message":${JSON.stringify(entry.message ?? '')},"schemaVersion":${LOG_SCHEMA_VERSION},"_fallback":1}`;
  }
  fn(out);
};

transports.push(consoleTransport);

/**
 * 외부 transport 등록 (예: Sentry). 1회만 호출 — entry-point 에서.
 *
 * 사용:
 *   import { addTransport } from '@sewmu/api';
 *   addTransport(sentryTransport);
 */
export function addTransport(t: LogTransport): void {
  transports.push(t);
}

/** 테스트 전용 — transports 초기화 (console 만 남김). */
export function _resetTransportsForTest(): void {
  transports.length = 0;
  transports.push(consoleTransport);
}

/* ─────────────────────────────────────────────────────────────
 * PII redaction — 사용자 입력 직접 들어올 수 있는 필드 마스킹.
 *
 * 사장님 prod 에 거래처 phone/email/실명 가 다수 → 로그/Sentry 로 새면 GDPR/개인정보보호법 위반.
 * 모든 entry.meta 와 entry.message 가 이 패스 통과.
 * ───────────────────────────────────────────────────────────── */

/* Phase 15 (2026-05-12) audit fix: `name` 키 제거 — too generic.
 * meta:{name:'set_admin'} 같은 정상 사용을 [REDACTED] 처리하던 footgun.
 * 실명 추적은 `real_name` / `realName` 키만. */
const PII_KEYS = new Set([
  'phone',
  'phone_number',
  'phoneNumber',
  'email',
  'real_name',
  'realName',
  'business_number',
  'businessNumber',
  'resident_no',
  'residentNo',
  'rrn',
  'password',
  'token',
  'api_key',
  'apiKey',
  'secret',
  'authorization',
]);

/** 깊이 우선 — meta 안 key 이름이 PII allowlist 매칭 시 '[REDACTED]' 으로. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[MaxDepth]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEYS.has(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object') {
      out[k] = redact(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** 모든 transport 에 entry 발송 (redaction 적용 후). */
function emit(rawEntry: LogEntry): void {
  /* meta 깊이 redaction — 원본 ctx 객체 mutate 하지 않음 */
  const entry: LogEntry = {
    ...rawEntry,
    meta: rawEntry.meta ? (redact(rawEntry.meta) as Record<string, unknown>) : undefined,
  };
  for (const t of transports) {
    try {
      t(entry);
    } catch {
      /* transport 자체 실패 — 다른 transport 는 계속. console.error 만이라도 */
      try {
        console.error(`[logger-transport-failed] ${entry.level}: ${entry.message}`);
      } catch {
        /* terminal */
      }
    }
  }
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
    requestId: ctx.requestId,
    meta,
  };
}

/**
 * Phase 12 (2026-05-12): Cloudflare Workers request → requestId 추출 헬퍼.
 *
 * 호출 순서:
 *   1. fetchHandler 에서 `extractRequestId(request)` 호출
 *   2. 결과를 tRPC Context 의 `requestId` 에 inject
 *   3. 모든 logger.* 호출 시 자동 첨부
 *
 * 우선순위:
 *   1. `cf-ray` 헤더 (Cloudflare 자동 부여, 16자 hex)
 *   2. `x-request-id` 헤더 (호출자가 명시 set 한 경우)
 *   3. crypto.randomUUID() (마지막 fallback)
 */
export function extractRequestId(req: Request): string {
  return (
    req.headers.get('cf-ray') ||
    req.headers.get('x-request-id') ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  );
}
