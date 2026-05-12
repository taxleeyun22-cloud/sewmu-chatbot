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
import { logger, logCtx, type LogEntry } from '../logger';
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
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
    delete process.env.LOG_LEVEL;
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

  it('circular ref → [Circular] sentinel + 구조 유지', () => {
    const circular: Record<string, unknown> = { name: 'parent' };
    circular.self = circular;
    logger.info('test', { meta: { circular } });
    expect(logSpy).toHaveBeenCalled();
    const raw = logSpy.mock.calls[0][0] as string;
    /* 결정적 검증: parse 가능 + level/message/schemaVersion 보존 */
    const parsed = JSON.parse(raw) as LogEntry;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test');
    expect(parsed.schemaVersion).toBe(1);
    expect(raw).toContain('[Circular]');
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
});
