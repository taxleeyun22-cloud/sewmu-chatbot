/**
 * Phase Next-Day22 (2026-05-09): DrizzleD1Adapter 단위 테스트.
 *
 * Drizzle 의 select/insert/update/delete chainable API 를 mock 으로 재현.
 * 실제 DB 없이 각 adapter 메서드의 SQL 의도 검증.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* drizzle-orm 의 eq/and 가 우리 mock chain 에서는 의미 없음 (chain 은 인자 무시).
 * 단지 import 가능하게 mock — adapter 코드 자체는 변경 X. */
vi.mock('drizzle-orm', () => ({
  eq: (..._args: any[]) => ({ __op: 'eq' }),
  and: (..._args: any[]) => ({ __op: 'and' }),
}));

const { DrizzleD1Adapter } = await import('./drizzle-adapter');

/**
 * In-memory chainable mock — Drizzle 호출 흐름 모방.
 * 각 메서드는 그저 자기 자신을 반환 (chain 가능),
 * 마지막 .limit() / .returning() 에서 미리 설정된 결과 반환.
 */
function makeMockDb() {
  const state = {
    selectResults: [] as any[][],     // queue of select results
    insertReturning: [] as any[][],
    insertValues: [] as any[],
    updateValues: [] as any[],
    updateWheres: [] as any[],
    deleteWheres: [] as any[],
  };

  function chain(finalResult: any[]) {
    const c: any = {
      from: vi.fn(() => c),
      where: vi.fn(() => c),
      orderBy: vi.fn(() => c),
      limit: vi.fn(() => Promise.resolve(finalResult)),
      then: (resolve: any) => Promise.resolve(finalResult).then(resolve),
    };
    return c;
  }

  function selectChain() {
    const next = state.selectResults.shift() ?? [];
    return chain(next);
  }

  const db = {
    _state: state,
    select: vi.fn(() => selectChain()),
    insert: vi.fn((_table: any) => ({
      values: vi.fn((v: any) => {
        state.insertValues.push(v);
        return {
          returning: vi.fn(() => {
            const r = state.insertReturning.shift() ?? [{ id: 999 }];
            return Promise.resolve(r);
          }),
          then: (resolve: any) => Promise.resolve().then(resolve),
        };
      }),
    })),
    update: vi.fn((_table: any) => ({
      set: vi.fn((v: any) => {
        state.updateValues.push(v);
        return {
          where: vi.fn((w: any) => {
            state.updateWheres.push(w);
            return Promise.resolve();
          }),
        };
      }),
    })),
    delete: vi.fn((_table: any) => ({
      where: vi.fn((w: any) => {
        state.deleteWheres.push(w);
        return Promise.resolve();
      }),
    })),
  };
  return db;
}

const mockSchema = {
  users: { id: 'users.id', email: 'users.email' } as any,
  sessions: { token: 'sessions.token', user_id: 'sessions.user_id' } as any,
  accounts: {
    provider: 'accounts.provider',
    providerAccountId: 'accounts.providerAccountId',
    userId: 'accounts.user_id',
  } as any,
  verificationTokens: {
    identifier: 'vt.identifier',
    token: 'vt.token',
  } as any,
};

describe('DrizzleD1Adapter', () => {
  let db: ReturnType<typeof makeMockDb>;
  let adapter: ReturnType<typeof DrizzleD1Adapter>;

  beforeEach(() => {
    db = makeMockDb();
    adapter = DrizzleD1Adapter(db, mockSchema);
  });

  describe('createUser', () => {
    it('inserts user with required fields and returns AdapterUser shape', async () => {
      db._state.insertReturning.push([
        {
          id: 42,
          name: '박승호',
          email: 'park@example.com',
          email_verified: null,
          profile_image: null,
        },
      ]);

      const result = await adapter.createUser!({
        name: '박승호',
        email: 'park@example.com',
        emailVerified: null,
        image: null,
      });

      expect(result.id).toBe('42');
      expect(result.email).toBe('park@example.com');
      expect(result.name).toBe('박승호');

      const inserted = db._state.insertValues[0];
      expect(inserted.email).toBe('park@example.com');
      expect(inserted.provider).toBe('auth.js');
      expect(inserted.approval_status).toBe('pending');
      expect(inserted.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(inserted.last_login_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('serializes emailVerified Date to ISO string', async () => {
      db._state.insertReturning.push([{ id: 1, email_verified: '2026-05-09T00:00:00.000Z' }]);

      await adapter.createUser!({
        email: 'a@b.com',
        emailVerified: new Date('2026-05-09T00:00:00Z'),
      } as any);

      const inserted = db._state.insertValues[0];
      expect(inserted.email_verified).toBe('2026-05-09T00:00:00.000Z');
    });
  });

  describe('getUser', () => {
    it('returns null when not found', async () => {
      db._state.selectResults.push([]);
      const r = await adapter.getUser!('999');
      expect(r).toBeNull();
    });

    it('returns AdapterUser shape (id stringified)', async () => {
      db._state.selectResults.push([
        { id: 7, name: 'A', email: 'a@b.com', email_verified: null, profile_image: 'img' },
      ]);
      const r = await adapter.getUser!('7');
      expect(r).toEqual({
        id: '7',
        name: 'A',
        email: 'a@b.com',
        emailVerified: null,
        image: 'img',
      });
    });

    it('parses email_verified ISO into Date', async () => {
      db._state.selectResults.push([
        {
          id: 1,
          name: null,
          email: null,
          email_verified: '2026-05-09T00:00:00.000Z',
          profile_image: null,
        },
      ]);
      const r = await adapter.getUser!('1');
      expect(r?.emailVerified).toBeInstanceOf(Date);
      expect(r?.emailVerified?.toISOString()).toBe('2026-05-09T00:00:00.000Z');
    });
  });

  describe('getUserByEmail', () => {
    it('returns null when email not found', async () => {
      db._state.selectResults.push([]);
      expect(await adapter.getUserByEmail!('x@y')).toBeNull();
    });

    it('returns user when found', async () => {
      db._state.selectResults.push([
        { id: 9, name: 'X', email: 'x@y', email_verified: null, profile_image: null },
      ]);
      const u = await adapter.getUserByEmail!('x@y');
      expect(u?.id).toBe('9');
      expect(u?.email).toBe('x@y');
    });
  });

  describe('getUserByAccount', () => {
    it('returns null when no account row', async () => {
      db._state.selectResults.push([]); // accounts query empty
      const r = await adapter.getUserByAccount!({
        provider: 'kakao',
        providerAccountId: 'k123',
      });
      expect(r).toBeNull();
    });

    it('joins accounts → users (2 select calls)', async () => {
      db._state.selectResults.push([{ userId: 5 }]); // accounts
      db._state.selectResults.push([
        { id: 5, name: 'A', email: 'a@b', email_verified: null, profile_image: null },
      ]); // users

      const r = await adapter.getUserByAccount!({
        provider: 'kakao',
        providerAccountId: 'k123',
      });
      expect(r?.id).toBe('5');
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('returns null when account links to deleted/missing user', async () => {
      db._state.selectResults.push([{ userId: 99 }]); // accounts ok
      db._state.selectResults.push([]); // users not found
      const r = await adapter.getUserByAccount!({
        provider: 'kakao',
        providerAccountId: 'orphan',
      });
      expect(r).toBeNull();
    });
  });

  describe('linkAccount', () => {
    it('inserts account row with all OAuth fields', async () => {
      await adapter.linkAccount!({
        userId: '7',
        type: 'oauth',
        provider: 'kakao',
        providerAccountId: 'kakao-12345',
        access_token: 'at',
        refresh_token: 'rt',
        expires_at: 1234567890,
        token_type: 'bearer',
        scope: 'profile email',
        id_token: 'id-token',
        session_state: 'state',
      });

      const inserted = db._state.insertValues[0];
      expect(inserted.userId).toBe(7); // Number conversion
      expect(inserted.provider).toBe('kakao');
      expect(inserted.providerAccountId).toBe('kakao-12345');
      expect(inserted.access_token).toBe('at');
      expect(inserted.expires_at).toBe(1234567890);
    });

    it('handles missing optional OAuth fields (null)', async () => {
      await adapter.linkAccount!({
        userId: '1',
        type: 'oauth',
        provider: 'kakao',
        providerAccountId: 'k1',
      } as any);

      const inserted = db._state.insertValues[0];
      expect(inserted.refresh_token).toBeNull();
      expect(inserted.access_token).toBeNull();
    });
  });

  describe('createSession', () => {
    it('inserts session row + sets timestamps', async () => {
      const session = {
        sessionToken: 'tok-xyz',
        userId: '42',
        expires: new Date('2026-06-01T00:00:00Z'),
      };
      const r = await adapter.createSession!(session);
      expect(r).toEqual(session);

      const inserted = db._state.insertValues[0];
      expect(inserted.token).toBe('tok-xyz');
      expect(inserted.user_id).toBe(42);
      expect(inserted.expires_at).toBe('2026-06-01T00:00:00.000Z');
      expect(inserted.created_at).toBeTruthy();
      expect(inserted.last_accessed_at).toBeTruthy();
    });
  });

  describe('getSessionAndUser', () => {
    it('returns null when session token missing', async () => {
      db._state.selectResults.push([]); // sessions
      const r = await adapter.getSessionAndUser!('bad-token');
      expect(r).toBeNull();
    });

    it('returns null when user missing despite valid session', async () => {
      db._state.selectResults.push([
        { token: 't', user_id: 99, expires_at: '2026-06-01T00:00:00Z' },
      ]);
      db._state.selectResults.push([]); // user gone
      const r = await adapter.getSessionAndUser!('t');
      expect(r).toBeNull();
    });

    it('returns {session, user} when both exist', async () => {
      db._state.selectResults.push([
        { token: 't', user_id: 7, expires_at: '2026-06-01T00:00:00.000Z' },
      ]);
      db._state.selectResults.push([
        { id: 7, name: 'A', email: 'a@b', email_verified: null, profile_image: null },
      ]);
      const r = await adapter.getSessionAndUser!('t');
      expect(r?.session.sessionToken).toBe('t');
      expect(r?.session.userId).toBe('7');
      expect(r?.session.expires).toBeInstanceOf(Date);
      expect(r?.user.id).toBe('7');
    });
  });

  describe('deleteSession', () => {
    it('issues delete by token', async () => {
      await adapter.deleteSession!('tok-abc');
      expect(db.delete).toHaveBeenCalled();
      expect(db._state.deleteWheres).toHaveLength(1);
    });
  });

  describe('updateSession', () => {
    it('updates expires_at + last_accessed_at when expires given', async () => {
      db._state.selectResults.push([
        { token: 't', user_id: 1, expires_at: '2026-06-01T00:00:00.000Z' },
      ]);
      const r = await adapter.updateSession!({
        sessionToken: 't',
        expires: new Date('2026-07-01T00:00:00Z'),
      });
      const u = db._state.updateValues[0];
      expect(u.expires_at).toBe('2026-07-01T00:00:00.000Z');
      expect(u.last_accessed_at).toBeTruthy();
      expect(r?.sessionToken).toBe('t');
    });

    it('returns null when session not re-found after update', async () => {
      db._state.selectResults.push([]); // post-update select empty
      const r = await adapter.updateSession!({ sessionToken: 'gone' });
      expect(r).toBeNull();
    });
  });

  describe('verification tokens', () => {
    it('createVerificationToken inserts + returns the token', async () => {
      const data = {
        identifier: 'a@b',
        token: 'tk',
        expires: new Date('2026-06-01T00:00:00Z'),
      };
      const r = await adapter.createVerificationToken!(data);
      expect(r).toEqual(data);

      const inserted = db._state.insertValues[0];
      expect(inserted.identifier).toBe('a@b');
      expect(inserted.token).toBe('tk');
      expect(inserted.expires).toBe('2026-06-01T00:00:00.000Z');
    });

    it('useVerificationToken returns null when not found', async () => {
      db._state.selectResults.push([]);
      const r = await adapter.useVerificationToken!({
        identifier: 'a@b',
        token: 'no',
      });
      expect(r).toBeNull();
    });

    it('useVerificationToken returns + deletes when found', async () => {
      db._state.selectResults.push([
        { identifier: 'a@b', token: 'tk', expires: '2026-06-01T00:00:00.000Z' },
      ]);
      const r = await adapter.useVerificationToken!({
        identifier: 'a@b',
        token: 'tk',
      });
      expect(r?.identifier).toBe('a@b');
      expect(r?.expires).toBeInstanceOf(Date);
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    it('only updates provided fields', async () => {
      db._state.selectResults.push([
        { id: 1, name: 'NEW', email: 'old@b', email_verified: null, profile_image: null },
      ]);
      const r = await adapter.updateUser!({ id: '1', name: 'NEW' });
      const u = db._state.updateValues[0];
      expect(u.name).toBe('NEW');
      expect('email' in u).toBe(false);
      expect(r.name).toBe('NEW');
    });

    it('handles emailVerified Date serialization', async () => {
      db._state.selectResults.push([
        {
          id: 1,
          name: null,
          email: null,
          email_verified: '2026-05-09T00:00:00.000Z',
          profile_image: null,
        },
      ]);
      await adapter.updateUser!({
        id: '1',
        emailVerified: new Date('2026-05-09T00:00:00Z'),
      } as any);
      const u = db._state.updateValues[0];
      expect(u.email_verified).toBe('2026-05-09T00:00:00.000Z');
    });
  });
});
