/**
 * Phase 13 (2026-05-12): CSRF guard 단위 테스트.
 *
 * functions/api/_adminAuth.js 의 checkOriginCsrf — Origin/Referer 화이트리스트.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module 직접 import (Cloudflare Workers 패턴)
import { checkOriginCsrf, checkAdmin } from './_adminAuth.js';

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

  it('Phase 15 fix: POST + ?key=garbage (env 없음) → 403 (이전 bypass 우회 제거)', async () => {
    const req = makeRequest('POST', 'https://sewmu-chatbot.pages.dev/api/admin-users?key=garbage');
    const res = checkOriginCsrf(req) as Response;
    expect(res?.status).toBe(403);
  });

  it('Phase 15 fix: POST + ?key=ADMIN_KEY (env 일치) → 통과', () => {
    const req = makeRequest(
      'POST',
      'https://sewmu-chatbot.pages.dev/api/admin-users?key=real_admin_key',
    );
    /* env 전달 + 일치 시 bypass */
    expect(checkOriginCsrf(req, { ADMIN_KEY: 'real_admin_key' })).toBeNull();
  });

  it('Phase 15 fix: POST + ?key=wrong + env 있음 → 403 (timing-safe 비교)', () => {
    const req = makeRequest(
      'POST',
      'https://sewmu-chatbot.pages.dev/api/admin-users?key=wrong',
    );
    const res = checkOriginCsrf(req, { ADMIN_KEY: 'real_admin_key' }) as Response;
    expect(res?.status).toBe(403);
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

/**
 * 2026-10-02 사장님: "내 아이디로 로그인했는데 이게 왜 어드민이지"
 * 비번(admin_key_auth) 쿠키와 카톡 세션이 같이 있으면 → 세션의 신원(user_id) 을 쓰고, 비번 쿠키는 owner 권한만 보탠다.
 */
describe('checkAdmin — 비번 쿠키 + 세션 쿠키 겹침', () => {
  const KEY = 'real_admin_key';
  type AnyDb = ReturnType<typeof createTestDb>['d1'];
  let d1: AnyDb;

  /* admin-key-login.js 와 같은 토큰: "owner:{ts}.{base64(HMAC-SHA256(payload, ADMIN_KEY))}" */
  async function ownerToken(secret = KEY, ts = Date.now()) {
    const enc = new TextEncoder();
    const payload = 'owner:' + ts;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
    return payload + '.' + btoa(String.fromCharCode(...sig));
  }
  const ctx = (cookie: string, qs = '') => ({
    env: { DB: d1, ADMIN_KEY: KEY },
    request: { url: 'https://sewmu-chatbot.pages.dev/api/admin-whoami' + qs, method: 'GET', headers: { get: (k: string) => (k.toLowerCase() === 'cookie' ? cookie : null) } },
  });

  beforeEach(async () => {
    d1 = createTestDb().d1;
    await d1.prepare(`INSERT INTO users (id, name, real_name, is_admin, approval_status) VALUES (1, '이재윤', '이재윤', 1, 'approved_client')`).run();
    await d1.prepare(`INSERT INTO users (id, name, real_name, is_admin, approval_status, admin_role) VALUES (2, '직원', '김직원', 1, 'approved_client', 'editor')`).run();
    await d1.prepare(`INSERT INTO users (id, name, real_name, is_admin, approval_status) VALUES (3, '거래처', '거래처', 0, 'approved_client')`).run();
    for (const [tok, uid] of [['tok-owner', 1], ['tok-staff', 2], ['tok-client', 3]] as const) {
      await d1.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')`).bind(tok, uid).run();
    }
  });

  it('비번 쿠키만 → 익명 사장님 (userId null) — 종전 그대로', async () => {
    const a = await checkAdmin(ctx('admin_key_auth=' + (await ownerToken())));
    expect(a).toMatchObject({ ok: true, owner: true, userId: null, adminRole: 'owner' });
  });

  it('비번 쿠키 + 사장님 카톡 세션 → user_id=1 로 신원이 잡힌다', async () => {
    const a = await checkAdmin(ctx('admin_key_auth=' + (await ownerToken()) + '; session=tok-owner'));
    expect(a).toMatchObject({ ok: true, owner: true, userId: 1, adminRole: 'owner' });
  });

  it('비번 쿠키 + 직원(editor) 세션 → 직원 신원 + owner 권한 (비번 쿠키만 있던 때와 권한 범위 같음)', async () => {
    const a = await checkAdmin(ctx('session=tok-staff; admin_key_auth=' + (await ownerToken())));
    expect(a).toMatchObject({ ok: true, owner: true, userId: 2, adminRole: 'owner' });
  });

  it('직원 세션만 → editor, owner 아님', async () => {
    const a = await checkAdmin(ctx('session=tok-staff'));
    expect(a).toMatchObject({ ok: true, owner: false, userId: 2, adminRole: 'editor' });
  });

  it('위조·만료된 비번 쿠키는 권한을 못 보탠다', async () => {
    const forged = await checkAdmin(ctx('session=tok-staff; admin_key_auth=' + (await ownerToken('wrong-secret'))));
    expect(forged).toMatchObject({ owner: false, userId: 2, adminRole: 'editor' });
    const expired = await checkAdmin(ctx('session=tok-staff; admin_key_auth=' + (await ownerToken(KEY, Date.now() - 31 * 86400 * 1000))));
    expect(expired).toMatchObject({ owner: false, userId: 2, adminRole: 'editor' });
    expect(await checkAdmin(ctx('admin_key_auth=' + (await ownerToken('wrong-secret'))))).toBeNull();
  });

  it('거래처 세션은 비번 쿠키가 있어도 신원이 안 잡힌다 → 익명 사장님, 없으면 null', async () => {
    expect(await checkAdmin(ctx('session=tok-client; admin_key_auth=' + (await ownerToken())))).toMatchObject({ owner: true, userId: null });
    expect(await checkAdmin(ctx('session=tok-client'))).toBeNull();
  });

  it('?key= 는 여전히 최우선 익명 사장님', async () => {
    const a = await checkAdmin(ctx('session=tok-staff', '?key=' + KEY));
    expect(a).toMatchObject({ ok: true, owner: true, userId: null, adminRole: 'owner' });
  });
});
