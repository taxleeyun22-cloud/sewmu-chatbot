/**
 * Phase 13 (2026-05-12): Sentry transport 단위 테스트.
 *
 * DSN parse + transport 생성 + fetch payload 검증.
 * 실제 Sentry 호출 X (fetch mock).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSentryDsn, sentryTransportFromDsn } from './sentry';
import type { LogEntry } from '../logger';

describe('parseSentryDsn', () => {
  it('표준 DSN 파싱', () => {
    const r = parseSentryDsn('https://abc123@o12345.ingest.sentry.io/678');
    expect(r).toEqual({
      publicKey: 'abc123',
      host: 'o12345.ingest.sentry.io',
      projectId: '678',
      protocol: 'https',
    });
  });

  it('http DSN 도 OK (테스트용 self-hosted)', () => {
    const r = parseSentryDsn('http://key@sentry.local/1');
    expect(r?.protocol).toBe('http');
  });

  it('publicKey 없으면 null', () => {
    expect(parseSentryDsn('https://o123.ingest.sentry.io/1')).toBeNull();
  });

  it('projectId 없으면 null', () => {
    expect(parseSentryDsn('https://key@sentry.io')).toBeNull();
  });

  it('완전 깨진 문자열 null', () => {
    expect(parseSentryDsn('not a url')).toBeNull();
    expect(parseSentryDsn('')).toBeNull();
  });
});

describe('sentryTransportFromDsn', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let origFetch: typeof fetch;

  beforeEach(() => {
    origFetch = global.fetch;
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = origFetch;
  });

  const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
    level: 'error',
    message: 'test failure',
    timestamp: new Date('2026-05-12T18:00:00Z').toISOString(),
    schemaVersion: 1,
    procedure: 'users.setStatus',
    userId: 42,
    role: 'owner',
    requestId: 'cf-ray-abc',
    ...over,
  });

  it('DSN 없으면 null', () => {
    expect(sentryTransportFromDsn(undefined)).toBeNull();
    expect(sentryTransportFromDsn(null)).toBeNull();
    expect(sentryTransportFromDsn('')).toBeNull();
  });

  it('잘못된 DSN null', () => {
    expect(sentryTransportFromDsn('not a dsn')).toBeNull();
  });

  it('정상 DSN → transport 함수 반환', () => {
    const t = sentryTransportFromDsn('https://key@host.ingest.sentry.io/123');
    expect(typeof t).toBe('function');
  });

  it('error level → 항상 발송 (sample 무관)', () => {
    const t = sentryTransportFromDsn('https://key@host.sentry.io/1', { sampleRate: 0 });
    t!(entry({ level: 'error' }));
    expect(fetchMock).toHaveBeenCalled();
  });

  it('info level + sampleRate=0 → 발송 안 함', () => {
    const t = sentryTransportFromDsn('https://key@host.sentry.io/1', { sampleRate: 0 });
    t!(entry({ level: 'info' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POST body 가 Sentry event 형식', () => {
    const t = sentryTransportFromDsn('https://key@host.sentry.io/1', {
      environment: 'production',
      release: 'abc123',
    });
    t!(entry());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/1/store/');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Sentry-Auth']).toContain('sentry_key=key');
    const body = JSON.parse(opts.body);
    expect(body.message.formatted).toBe('test failure');
    expect(body.environment).toBe('production');
    expect(body.release).toBe('abc123');
    expect(body.transaction).toBe('users.setStatus');
    expect(body.user.id).toBe('42');
    expect(body.tags.request_id).toBe('cf-ray-abc');
  });

  it('Error 객체 → exception 필드 직렬화', () => {
    const t = sentryTransportFromDsn('https://k@h.s.io/1');
    t!(
      entry({
        error: {
          name: 'TRPCError',
          message: 'DB failure',
          stack: 'TRPCError: DB failure\n    at users.list (/x/users.ts:42:10)',
        },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.exception.values[0].type).toBe('TRPCError');
    expect(body.exception.values[0].value).toBe('DB failure');
    expect(body.exception.values[0].stacktrace.frames).toHaveLength(1);
    expect(body.exception.values[0].stacktrace.frames[0].function).toBe('users.list');
  });

  it('fetch 실패해도 throw 안 함', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const t = sentryTransportFromDsn('https://k@h.s.io/1');
    expect(() => t!(entry())).not.toThrow();
  });
});
