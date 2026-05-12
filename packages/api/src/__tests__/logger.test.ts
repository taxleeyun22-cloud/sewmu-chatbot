/**
 * Phase Next-Day29 (2026-05-12): structured logger 단위 테스트.
 * console emit 형식 + error 직렬화 + logCtx 추출 검증.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, logCtx, type LogEntry } from '../logger';
import type { Context } from '../trpc';

describe('logger (구조화 로깅 — Sentry/Datadog/Logpush 호환)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('info → console.log + JSON 1줄', () => {
    logger.info('user logged in', { userId: 42, procedure: 'users.login' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const raw = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as LogEntry;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('user logged in');
    expect(parsed.userId).toBe(42);
    expect(parsed.procedure).toBe('users.login');
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

  it('circular ref 도 안 깨짐 (fallback 출력)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    /* meta 가 circular — JSON.stringify 깨짐 → fallback */
    logger.info('test', { meta: { circular } });
    expect(logSpy).toHaveBeenCalled();
    /* JSON parse 실패해도 fallback string 호출됨 */
    const raw = logSpy.mock.calls[0][0] as string;
    expect(raw).toBeTruthy();
  });
});

describe('logCtx (tRPC ctx → LogContext 추출)', () => {
  it('owner 역할 추출', () => {
    const ctx = {
      auth: { userId: 1, isOwner: true, isAdmin: false, adminRole: null },
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
