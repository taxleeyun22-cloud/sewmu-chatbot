/**
 * Phase 13 (2026-05-12): Sentry transport — Cloudflare Workers / Edge 호환.
 *
 * 외부 dep 없이 fetch 로 Sentry HTTP store API 호출.
 * `@sentry/cloudflare` 패키지 도입 시 이 파일을 그것의 transport 로 교체 가능.
 *
 * 사용:
 *   import { addTransport, sentryTransportFromDsn } from '@sewmu/api';
 *   const t = sentryTransportFromDsn(process.env.SENTRY_DSN);
 *   if (t) addTransport(t);
 *
 * 사장님 set up 절차:
 *   1. Sentry 가입 → 새 프로젝트 (Cloudflare Workers 또는 Node)
 *   2. DSN 복사 (형식: https://abc123@o123.ingest.sentry.io/456)
 *   3. Cloudflare Pages → Settings → Environment variables → `SENTRY_DSN` 추가
 *   4. apps/admin entry (app/api/trpc/[trpc]/route.ts) 에서 `addTransport(sentryTransport)` 호출
 *
 * 미설정 (DSN 없음) 시: `sentryTransportFromDsn` 가 null 반환 → 등록 안 됨 → no-op.
 */
import type { LogEntry, LogTransport } from '../logger';

/* Sentry DSN 파싱 결과 */
interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
}

/** Sentry DSN `https://<publicKey>@<host>/<projectId>` 파싱. 실패 시 null. */
export function parseSentryDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return null;
    return {
      publicKey,
      host: u.host,
      projectId,
      protocol: u.protocol.replace(':', ''),
    };
  } catch {
    return null;
  }
}

/* Sentry severity 매핑 — LogLevel → Sentry level */
const SENTRY_LEVEL: Record<string, string> = {
  debug: 'debug',
  info: 'info',
  warn: 'warning',
  error: 'error',
  fatal: 'fatal',
};

/**
 * Sentry envelope POST — 한 LogEntry 를 Sentry event 로 변환 + 발송.
 *
 * Cloudflare Workers 안에서 `fetch()` 호출. 실패해도 외부에 throw 안 함 (transport 룰).
 */
function buildEvent(entry: LogEntry, environment: string, release: string) {
  return {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date(entry.timestamp).getTime() / 1000,
    level: SENTRY_LEVEL[entry.level] ?? 'info',
    platform: 'javascript',
    environment,
    release,
    logger: 'sewmu-api',
    message: { formatted: entry.message },
    /* tRPC procedure path → Sentry transaction (그룹핑) */
    transaction: entry.procedure,
    /* 사용자 컨텍스트 (id 만 — PII 는 logger 가 이미 redact 함) */
    user: entry.userId
      ? { id: String(entry.userId), role: entry.role }
      : undefined,
    /* request id → Sentry tag */
    tags: {
      schema_version: String(entry.schemaVersion ?? 1),
      role: entry.role ?? 'unknown',
      ...(entry.requestId ? { request_id: entry.requestId } : {}),
    },
    extra: entry.meta,
    exception: entry.error
      ? {
          values: [
            {
              type: entry.error.name,
              value: entry.error.message,
              stacktrace: entry.error.stack
                ? { frames: parseStack(entry.error.stack) }
                : undefined,
            },
          ],
        }
      : undefined,
  };
}

/** 간단한 stack parser — Sentry frames 형식.  V8/Node/Chrome 호환. */
function parseStack(stack: string) {
  return stack
    .split('\n')
    .slice(1, 21) // 상위 1 (Error: msg) 제외 + 20개 까지
    .map((line) => {
      const m = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?/.exec(line.trim());
      if (!m) return { function: line.trim() };
      return {
        function: m[1] || '<anonymous>',
        filename: m[2],
        lineno: parseInt(m[3], 10),
        colno: parseInt(m[4], 10),
      };
    });
}

/**
 * DSN 으로 transport 생성. DSN 없거나 파싱 실패 시 null (= 등록 안 함).
 *
 * @param dsn Sentry DSN (env 변수 `SENTRY_DSN`)
 * @param opts.environment 'production' | 'preview' (Cloudflare CF_PAGES_BRANCH 기반)
 * @param opts.release git SHA 등
 * @param opts.sampleRate 0~1 — 메시지 sampling (cost 절감)
 */
export function sentryTransportFromDsn(
  dsn: string | undefined | null,
  opts: { environment?: string; release?: string; sampleRate?: number } = {},
): LogTransport | null {
  if (!dsn) return null;
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return null;

  const env = opts.environment ?? 'production';
  const release = opts.release ?? 'unknown';
  const sampleRate = opts.sampleRate ?? 1.0;

  /* Sentry store endpoint */
  const storeUrl = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/store/`;
  const authHeader = `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=sewmu-api/1.0`;

  return (entry: LogEntry) => {
    /* error/fatal 은 항상, 나머지는 sample */
    if (entry.level !== 'error' && entry.level !== 'fatal' && Math.random() > sampleRate) {
      return;
    }
    const event = buildEvent(entry, env, release);
    /* fire-and-forget — 응답 안 기다림 (Workers CPU 시간 절약) */
    fetch(storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': authHeader,
      },
      body: JSON.stringify(event),
    }).catch(() => {
      /* transport 실패 시 silent — console 으로는 이미 emit 됨 */
    });
  };
}
