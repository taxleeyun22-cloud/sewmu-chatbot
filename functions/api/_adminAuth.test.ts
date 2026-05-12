/**
 * Phase 13 (2026-05-12): CSRF guard 단위 테스트.
 *
 * functions/api/_adminAuth.js 의 checkOriginCsrf — Origin/Referer 화이트리스트.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { checkOriginCsrf } from './_adminAuth.js';

/**
 * Origin / Referer 는 fetch spec 의 "forbidden header" 라 Request 생성자로 못 set.
 * 따라서 Headers 객체에 직접 append 후 Request 에 attach. Node 20+ 가능.
 */
function makeRequest(
  method: string,
  url = 'https://sewmu-chatbot.pages.dev/api/admin-users',
  headerEntries: Record<string, string> = {},
): Request {
  const h = new Headers();
  for (const [k, v] of Object.entries(headerEntries)) h.set(k, v);
  /* Request 생성 후 forbidden header 강제 inject — Cloudflare Workers / Node 에서는
   * Request.headers 가 Headers 객체로 노출되고 modify 가능. Workers prod 동작과 동일. */
  const req = new Request(url, { method });
  /* private 필드 set 불가 — 우리는 helper 가 request.headers.get('origin') 호출하므로
   * 그 headers 가 forbidden header 도 readable 해야 함. Workers 에선 가능, Node 18+ 도
   * 가능. 단, Headers append 가 forbidden header 차단할 수 있어 try/catch. */
  for (const [k, v] of Object.entries(headerEntries)) {
    try {
      req.headers.set(k, v);
    } catch {
      /* set 실패 시 Object.defineProperty 로 강제 override 시도 */
    }
  }
  /* fallback: 새 Request 안 가능하면, 우리만 위한 mock Request */
  const mock = {
    method,
    url,
    headers: {
      get(name: string): string | null {
        const v = headerEntries[name.toLowerCase()];
        return v ?? null;
      },
    },
  };
  /* helper 가 .method / .url / .headers.get(name) 만 호출 — mock 충분 */
  return mock as unknown as Request;
}

describe('checkOriginCsrf', () => {
  it('GET → null (safe method, 가드 통과)', () => {
    expect(checkOriginCsrf(makeRequest('GET'))).toBeNull();
  });

  it('HEAD → null', () => {
    expect(checkOriginCsrf(makeRequest('HEAD'))).toBeNull();
  });

  it('OPTIONS → null (preflight)', () => {
    expect(checkOriginCsrf(makeRequest('OPTIONS'))).toBeNull();
  });

  it('POST + ADMIN_KEY URL param → 통과 (third-party 가 key 모름)', () => {
    const req = makeRequest('POST', 'https://sewmu-chatbot.pages.dev/api/admin-users?key=abc');
    expect(checkOriginCsrf(req)).toBeNull();
  });

  it('POST + Origin = sewmu-chatbot prod → 통과', () => {
    const req = makeRequest('POST', 'https://sewmu-chatbot.pages.dev/api/admin-users', {
      origin: 'https://sewmu-chatbot.pages.dev',
    });
    expect(checkOriginCsrf(req)).toBeNull();
  });

  it('POST + Origin = sewmu-admin prod → 통과', () => {
    const req = makeRequest('POST', 'https://sewmu-admin.pages.dev/api/admin-users', {
      origin: 'https://sewmu-admin.pages.dev',
    });
    expect(checkOriginCsrf(req)).toBeNull();
  });

  it('POST + Origin = 다른 사이트 → 403 차단', async () => {
    const req = makeRequest('POST', 'https://sewmu-chatbot.pages.dev/api/admin-users', {
      origin: 'https://evil.com',
    });
    const res = checkOriginCsrf(req) as Response;
    expect(res).not.toBeNull();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('CSRF');
  });

  it('POST + Referer = 우리 도메인 → 통과 (Origin 없을 때 fallback)', () => {
    const req = makeRequest('POST', 'https://sewmu-chatbot.pages.dev/api/admin-users', {
      referer: 'https://sewmu-chatbot.pages.dev/admin.html',
    });
    expect(checkOriginCsrf(req)).toBeNull();
  });

  it('POST + Referer = evil → 403', () => {
    const req = makeRequest('POST', 'https://sewmu-chatbot.pages.dev/api/admin-users', {
      referer: 'https://evil.com/csrf.html',
    });
    const res = checkOriginCsrf(req) as Response;
    expect(res?.status).toBe(403);
  });

  it('POST + Origin/Referer 둘 다 없음 → 403', async () => {
    const req = makeRequest('POST');
    const res = checkOriginCsrf(req) as Response;
    expect(res?.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Origin/Referer header required');
  });

  it('POST + Origin = preview branch (*.sewmu-chatbot.pages.dev) → 통과', () => {
    const req = makeRequest('POST', 'https://my-branch.sewmu-chatbot.pages.dev/api/x', {
      origin: 'https://my-branch.sewmu-chatbot.pages.dev',
    });
    expect(checkOriginCsrf(req)).toBeNull();
  });

  it('POST + Origin = localhost (개발) → 통과', () => {
    const req = makeRequest('POST', 'http://localhost:3000/api/x', {
      origin: 'http://localhost:3000',
    });
    expect(checkOriginCsrf(req)).toBeNull();
  });

  it('PUT 도 검증 대상', () => {
    const req = makeRequest('PUT', 'https://sewmu-chatbot.pages.dev/x', {
      origin: 'https://evil.com',
    });
    const res = checkOriginCsrf(req) as Response;
    expect(res?.status).toBe(403);
  });

  it('DELETE 도 검증 대상', () => {
    const req = makeRequest('DELETE', 'https://sewmu-chatbot.pages.dev/x', {
      origin: 'https://evil.com',
    });
    const res = checkOriginCsrf(req) as Response;
    expect(res?.status).toBe(403);
  });
});
