/**
 * Phase 14 (2026-05-12): rate-limit 단위 테스트.
 *
 * D1 query 는 mock — sliding window 로직 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimit, clientIp, rateLimited } from './rate-limit';

function makeMockDb(initialCount = 0) {
  let count = initialCount;
  const inserts: Array<{ key: string; ts: number }> = [];
  return {
    inserts,
    db: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              first: async () => {
                if (/COUNT/.test(sql)) return { c: count };
                return null;
              },
              run: async () => {
                if (/INSERT/.test(sql)) {
                  inserts.push({ key: String(args[0]), ts: Number(args[1]) });
                  count++;
                } else if (/CREATE/.test(sql) || /DELETE/.test(sql)) {
                  /* ignore */
                }
              },
              all: async () => ({ results: [] }),
            };
          },
          run: async () => ({}),
        };
      },
    },
  };
}

describe('rateLimit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('첫 요청 → ok + remaining=limit-1', async () => {
    const { db } = makeMockDb(0);
    const r = await rateLimit(db, 'admin-login:1.2.3.4', 10, 60);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(9);
  });

  it('한도 초과 → ok=false + retryAfter', async () => {
    const { db } = makeMockDb(10);
    const r = await rateLimit(db, 'admin-login:1.2.3.4', 10, 60);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(60);
    expect(r.remaining).toBe(0);
  });

  it('db null → 항상 통과 (fail-open)', async () => {
    const r = await rateLimit(null, 'k', 10, 60);
    expect(r.ok).toBe(true);
  });

  it('key 빈 문자열 → 통과 (fail-open)', async () => {
    const { db } = makeMockDb(100);
    const r = await rateLimit(db, '', 10, 60);
    expect(r.ok).toBe(true);
  });

  it('INSERT 가 실제로 호출됨 (요청 카운팅)', async () => {
    const { db, inserts } = makeMockDb(0);
    await rateLimit(db, 'auth:1.1.1.1', 5, 60);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].key).toBe('auth:1.1.1.1');
  });

  it('DB throw → fail-open (서비스 중단 안 함)', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => {
            throw new Error('DB down');
          },
          run: async () => {
            throw new Error('DB down');
          },
        }),
        run: async () => {
          throw new Error('DB down');
        },
      }),
    };
    const r = await rateLimit(db, 'k', 10, 60);
    expect(r.ok).toBe(true);
  });
});

describe('clientIp', () => {
  function makeReq(headers: Record<string, string>): Request {
    const h = new Headers();
    for (const [k, v] of Object.entries(headers)) h.set(k, v);
    return new Request('https://x.com', { headers: h });
  }

  it('cf-connecting-ip 우선', () => {
    expect(
      clientIp(
        makeReq({
          'cf-connecting-ip': '1.2.3.4',
          'x-forwarded-for': '5.6.7.8',
        }),
      ),
    ).toBe('1.2.3.4');
  });

  it('cf-connecting-ip 없으면 x-forwarded-for 첫 IP', () => {
    expect(clientIp(makeReq({ 'x-forwarded-for': '5.6.7.8, 9.10.11.12' }))).toBe(
      '5.6.7.8',
    );
  });

  it('둘 다 없으면 unknown', () => {
    expect(clientIp(makeReq({}))).toBe('unknown');
  });
});

describe('rateLimited (429 Response 헬퍼)', () => {
  it('Retry-After + X-RateLimit-* 헤더 포함', () => {
    const r = rateLimited(60, 10);
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
    expect(r.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(r.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('body JSON', async () => {
    const r = rateLimited(60);
    const body = (await r.json()) as { error: string; retry_after_seconds: number };
    expect(body.error).toBe('rate_limit_exceeded');
    expect(body.retry_after_seconds).toBe(60);
  });
});
