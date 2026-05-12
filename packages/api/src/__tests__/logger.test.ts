/**
 * Phase Next-Day29 + Phase 10 cleanup (2026-05-12): structured logger 단위 테스트.
 *
 * 검증 대상:
 * - emit 형식 (JSON 1줄 + schemaVersion + timestamp)
 * - Error 직렬화 (name/message/stack/cause)
 * - circular ref safe (safeStringify)
 * - level filter (LOG_LEVEL env)
 * - logCtx 역할 추출 (calculateRole 위임)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logger,
  logCtx,
  addTransport,
  extractRequestId,
  _resetTransportsForTest,
  type LogEntry,
  type LogTransport,
} from '../logger';
import type { Context } from '../trpc';

describe('logger (구조화 로깅 — Logpush/Sentry/Datadog 호환)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    /* default LOG_LEVEL — tests assume debug+ all emit */
    process.env.LOG_LEVEL = 'debug';
    /* transport 초기화 — 이전 테스트가 addTransport 한 게 누수 안 되게 */
    _resetTransportsForTest();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
    delete process.env.LOG_LEVEL;
    _resetTransportsForTest();
  });

  it('info → console.log + JSON 1줄 + schemaVersion', () => {
    logger.info('user logged in', { userId: 42, procedure: 'users.login' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const raw = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as LogEntry;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('user logged in');
    expect(parsed.userId).toBe(42);
    expect(parsed.procedure).toBe('users.login');
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('warn → console.warn', () => {
    logger.warn('something off');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('error → console.error + Error 직렬화 (name + message + stack)', () => {
    const err = new Error('DB connection failed');
    logger.error('Failed query', { procedure: 'users.list' }, err);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const raw = errSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as LogEntry;
    expect(parsed.level).toBe('error');
    expect(parsed.error?.name).toBe('Error');
    expect(parsed.error?.message).toBe('DB connection failed');
    expect(parsed.error?.stack).toBeTruthy();
  });

  it('Error.cause 도 직렬화 (Node 16+)', () => {
    const root = new Error('root cause');
    const wrapper = new Error('wrapper', { cause: root });
    logger.error('chained', undefined, wrapper);
    const parsed = JSON.parse(errSpy.mock.calls[0][0] as string) as LogEntry;
    expect(parsed.error?.cause).toBe('root cause');
  });

  it('non-Error 값도 직렬화 (NonError name)', () => {
    logger.error('weird throw', undefined, 'string thrown');
    const raw = errSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as LogEntry;
    expect(parsed.error?.name).toBe('NonError');
    expect(parsed.error?.message).toBe('string thrown');
  });

  it('fatal → console.error', () => {
    logger.fatal('total death', { procedure: 'system.boot' });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errSpy.mock.calls[0][0] as string) as LogEntry;
    expect(parsed.level).toBe('fatal');
  });

  it('circular ref → 무한 루프 안 빠짐 (Phase 12: redact depth limit + safeStringify WeakSet)', () => {
    const circular: Record<string, unknown> = { label: 'parent' };
    circular.self = circular;
    logger.info('test', { meta: { circular } });
    expect(logSpy).toHaveBeenCalled();
    const raw = logSpy.mock.calls[0][0] as string;
    /* parse 가능 + level/message/schemaVersion 보존 (무한 루프 X) */
    const parsed = JSON.parse(raw) as LogEntry;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test');
    expect(parsed.schemaVersion).toBe(1);
    /* redact() 가 먼저 deep-copy 하며 depth 5 cap — [MaxDepth] sentinel */
    expect(raw).toContain('[MaxDepth]');
  });

  it('bigint 도 안전 직렬화', () => {
    logger.info('bigint test', { meta: { id: BigInt('123456789012345') } });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as LogEntry;
    expect((parsed.meta as { id: string }).id).toBe('123456789012345');
  });

  it('LOG_LEVEL=warn → info/debug 억제', () => {
    process.env.LOG_LEVEL = 'warn';
    logger.debug('skip me');
    logger.info('skip me too');
    logger.warn('keep me');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('LOG_LEVEL=error → warn 도 억제', () => {
    process.env.LOG_LEVEL = 'error';
    logger.warn('skip');
    logger.error('keep');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 12 — PII redaction (logger.meta)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.LOG_LEVEL = 'debug';
    _resetTransportsForTest();
  });
  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.LOG_LEVEL;
    _resetTransportsForTest();
  });

  it('phone / email / real_name → [REDACTED]', () => {
    logger.info('test', {
      meta: { phone: '010-1234-5678', email: 'a@b.com', real_name: '박승호' },
    });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as LogEntry;
    expect((parsed.meta as Record<string, string>).phone).toBe('[REDACTED]');
    expect((parsed.meta as Record<string, string>).email).toBe('[REDACTED]');
    expect((parsed.meta as Record<string, string>).real_name).toBe('[REDACTED]');
  });

  it('password / token / api_key → [REDACTED]', () => {
    logger.info('test', {
      meta: { password: 'secret', token: 'abc', api_key: 'k', authorization: 'Bearer x' },
    });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as LogEntry;
    const m = parsed.meta as Record<string, string>;
    expect(m.password).toBe('[REDACTED]');
    expect(m.token).toBe('[REDACTED]');
    expect(m.api_key).toBe('[REDACTED]');
    expect(m.authorization).toBe('[REDACTED]');
  });

  it('비-PII 키는 그대로', () => {
    logger.info('test', { meta: { messageLen: 42, status: 'pending' } });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as LogEntry;
    expect((parsed.meta as Record<string, unknown>).messageLen).toBe(42);
    expect((parsed.meta as Record<string, unknown>).status).toBe('pending');
  });

  it('깊은 nesting 도 redact (depth 5 까지)', () => {
    logger.info('test', { meta: { user: { profile: { phone: '010' } } } });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as LogEntry;
    const phone = ((parsed.meta as { user: { profile: { phone: string } } }).user.profile.phone);
    expect(phone).toBe('[REDACTED]');
  });

  it('array 안 객체도 redact', () => {
    logger.info('test', { meta: { users: [{ phone: '1' }, { phone: '2' }] } });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as LogEntry;
    const users = (parsed.meta as { users: Array<{ phone: string }> }).users;
    expect(users[0].phone).toBe('[REDACTED]');
    expect(users[1].phone).toBe('[REDACTED]');
  });

  it('원본 ctx 객체는 mutate 안 됨 (불변)', () => {
    const original = { meta: { phone: '010' } };
    logger.info('test', original);
    /* 호출 후에도 원본은 그대로 */
    expect(original.meta.phone).toBe('010');
  });
});

describe('Phase 12 — Pluggable transports', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.LOG_LEVEL = 'debug';
    _resetTransportsForTest();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
    _resetTransportsForTest();
  });

  it('addTransport 한 callback 이 entry 받음 (console + custom 동시)', () => {
    const received: LogEntry[] = [];
    const sink: LogTransport = (e) => received.push(e);
    addTransport(sink);
    logger.info('hello', { userId: 7 });
    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('hello');
    expect(received[0].userId).toBe(7);
  });

  it('transport 1개 throw 해도 다른 transport 는 계속 실행', () => {
    const ok: LogTransport = vi.fn();
    const bad: LogTransport = () => {
      throw new Error('transport boom');
    };
    addTransport(bad);
    addTransport(ok);
    logger.info('test');
    expect(ok).toHaveBeenCalled();
  });
});

describe('Phase 12 — extractRequestId', () => {
  it('cf-ray 헤더 있으면 그대로 사용', () => {
    const req = new Request('https://example.com', {
      headers: { 'cf-ray': '8abc123-NRT' },
    });
    expect(extractRequestId(req)).toBe('8abc123-NRT');
  });

  it('cf-ray 없고 x-request-id 있으면 그것 사용', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-request-id': 'custom-id-42' },
    });
    expect(extractRequestId(req)).toBe('custom-id-42');
  });

  it('cf-ray 우선 (둘 다 있으면)', () => {
    const req = new Request('https://example.com', {
      headers: { 'cf-ray': 'cf-id', 'x-request-id': 'other' },
    });
    expect(extractRequestId(req)).toBe('cf-id');
  });

  it('둘 다 없으면 fallback UUID 생성', () => {
    const req = new Request('https://example.com');
    const id = extractRequestId(req);
    expect(id).toBeTruthy();
    expect(id.length).toBeGreaterThan(8);
  });
});

describe('logCtx (tRPC ctx → LogContext 추출, calculateRole 위임)', () => {
  it('owner 역할 추출', () => {
    const ctx = {
      auth: { userId: 1, isOwner: true, isAdmin: true, adminRole: null },
    } as unknown as Context;
    const out = logCtx(ctx, 'users.setStatus');
    expect(out.userId).toBe(1);
    expect(out.role).toBe('owner');
    expect(out.procedure).toBe('users.setStatus');
  });

  it('adminRole 우선 (노션 5단계)', () => {
    const ctx = {
      auth: { userId: 5, isOwner: false, isAdmin: true, adminRole: 'editor' },
    } as unknown as Context;
    const out = logCtx(ctx, 'memos.create');
    expect(out.role).toBe('editor');
  });

  it('adminRole 빈 문자열 → fallback (calculateRole 호출)', () => {
    const ctx = {
      auth: { userId: 5, isOwner: false, isAdmin: true, adminRole: '' },
    } as unknown as Context;
    const out = logCtx(ctx, 'rooms.list');
    /* '' 는 ?? 가 무시 → falsy 분기 → admin */
    expect(out.role).toBe('admin');
  });

  it('비로그인 customer fallback', () => {
    const ctx = {
      auth: { userId: null, isOwner: false, isAdmin: false, adminRole: null },
    } as unknown as Context;
    const out = logCtx(ctx, 'chat.send');
    expect(out.userId).toBeNull();
    expect(out.role).toBe('customer');
  });

  it('meta payload 첨부', () => {
    const ctx = {
      auth: { userId: 1, isOwner: true, isAdmin: true, adminRole: 'owner' },
    } as unknown as Context;
    const out = logCtx(ctx, 'users.delete', { targetId: 42 });
    expect(out.meta).toEqual({ targetId: 42 });
  });

  it('Phase 12 — requestId 도 자동 첨부', () => {
    const ctx = {
      auth: { userId: 1, isOwner: true, isAdmin: true, adminRole: 'owner' },
      requestId: 'cf-ray-abc-NRT',
    } as unknown as Context;
    const out = logCtx(ctx, 'users.list');
    expect(out.requestId).toBe('cf-ray-abc-NRT');
  });
});
