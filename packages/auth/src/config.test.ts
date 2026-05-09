/**
 * Phase Next-Day22 (2026-05-09): buildAuthConfig 테스트.
 *
 * 옵션 → NextAuthConfig 정확성 검증.
 * - JWT-only mode (db/schema 없을 때)
 * - Database mode (db + schema 둘 다 제공)
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('drizzle-orm', () => ({
  eq: () => ({ __op: 'eq' }),
  and: () => ({ __op: 'and' }),
}));

const { buildAuthConfig, buildAuthConfigSimple } = await import('./config');

describe('buildAuthConfig', () => {
  it('returns NextAuthConfig with kakao + naver providers', () => {
    const cfg = buildAuthConfig({
      env: { KAKAO_CLIENT_ID: 'kid', KAKAO_CLIENT_SECRET: 'ks' },
    });
    expect(cfg.providers).toHaveLength(2);
    expect(cfg.pages?.signIn).toBe('/login');
  });

  it('JWT-only mode when no db/schema (graceful fallback)', () => {
    const cfg = buildAuthConfig({ env: {} });
    expect(cfg.session?.strategy).toBe('jwt');
    expect(cfg.adapter).toBeUndefined();
  });

  it('Database mode when db + schema provided', () => {
    const fakeDb = { select: () => ({}) };
    const fakeSchema = { users: {}, sessions: {}, accounts: {}, verificationTokens: {} };
    const cfg = buildAuthConfig({
      db: fakeDb,
      schema: fakeSchema,
      env: { AUTH_SECRET: 'secret' },
    });
    expect(cfg.session?.strategy).toBe('database');
    expect(cfg.adapter).toBeDefined();
  });

  it('passes env client credentials into providers', () => {
    const cfg = buildAuthConfig({
      env: {
        KAKAO_CLIENT_ID: 'k-id',
        KAKAO_CLIENT_SECRET: 'k-secret',
        NAVER_CLIENT_ID: 'n-id',
        NAVER_CLIENT_SECRET: 'n-secret',
      },
    });
    const kakao = cfg.providers[0] as { clientId?: string; clientSecret?: string };
    const naver = cfg.providers[1] as { clientId?: string; clientSecret?: string };
    expect(kakao.clientId).toBe('k-id');
    expect(kakao.clientSecret).toBe('k-secret');
    expect(naver.clientId).toBe('n-id');
    expect(naver.clientSecret).toBe('n-secret');
  });

  it('AUTH_SECRET propagated to config', () => {
    const cfg = buildAuthConfig({ env: { AUTH_SECRET: 'top-secret' } });
    expect(cfg.secret).toBe('top-secret');
  });

  describe('callbacks', () => {
    it('session callback injects user.id from token (JWT mode)', async () => {
      const cfg = buildAuthConfig({ env: {} });
      const session: any = { user: { name: 'A' } };
      const token: any = { userId: '42' };
      const r = await cfg.callbacks!.session!({ session, token } as any);
      expect((r.user as { id?: string }).id).toBe('42');
    });

    it('session callback injects user.id from user (DB mode)', async () => {
      const cfg = buildAuthConfig({ env: {} });
      const session: any = { user: { name: 'A' } };
      const user: any = { id: '7' };
      const r = await cfg.callbacks!.session!({ session, user } as any);
      expect((r.user as { id?: string }).id).toBe('7');
    });

    it('session callback no-op when no user', async () => {
      const cfg = buildAuthConfig({ env: {} });
      const session: any = {};
      const r = await cfg.callbacks!.session!({ session, token: {} } as any);
      expect(r).toEqual({});
    });

    it('jwt callback copies user.id to token.userId', async () => {
      const cfg = buildAuthConfig({ env: {} });
      const token: any = {};
      const user: any = { id: '99' };
      const r = await cfg.callbacks!.jwt!({ token, user } as any);
      expect(r.userId).toBe('99');
    });

    it('jwt callback no-op when no user (subsequent calls)', async () => {
      const cfg = buildAuthConfig({ env: {} });
      const token: any = { userId: 'existing' };
      const r = await cfg.callbacks!.jwt!({ token } as any);
      expect(r.userId).toBe('existing');
    });
  });
});

describe('buildAuthConfigSimple (backward compat Day 5)', () => {
  it('builds config with env only (no db)', () => {
    const cfg = buildAuthConfigSimple({ KAKAO_CLIENT_ID: 'k' });
    expect(cfg.session?.strategy).toBe('jwt');
    expect(cfg.providers).toHaveLength(2);
  });
});
