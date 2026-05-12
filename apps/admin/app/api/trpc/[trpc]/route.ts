/**
 * Phase Next-Day27 (2026-05-11): tRPC HTTP handler (apps/admin).
 *
 * fetch adapter — Cloudflare Pages 호환.
 * 2가지 인증 자동 인식:
 * 1. admin_key_auth cookie (HMAC 검증) → isOwner=true
 * 2. Auth.js session (향후)
 *
 * Cloudflare Pages next-on-pages 에서 binding 접근 = getRequestContext().env
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@sewmu/api';
import { verifyAdminKeyToken } from '@/lib/admin-key-auth';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Cloudflare Pages binding + env 접근 — runtime 에서만 호출 가능. */
function getCfEnv(): any {
  try {
    const { env } = getRequestContext();
    return env;
  } catch {
    /* dev mode fallback */
    return (globalThis as any).env || (process as any)?.env || {};
  }
}

/* timing-safe 문자열 비교 (옛 _adminAuth.js 호환) */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const handler = async (req: Request) => {
  const env = getCfEnv();
  const url = new URL(req.url);

  /* 인증 — 3가지 경로 (옛 admin + 새 admin 모두 호환) */
  let auth: {
    userId: number | null;
    isOwner: boolean;
    isAdmin: boolean;
    adminRole?: string | null;
  } = {
    userId: null,
    isOwner: false,
    isAdmin: false,
    adminRole: null,
  };

  /* 1. URL ?key=ADMIN_KEY (옛 admin.html 방식 — 사장님 빠른 진입) */
  const urlKey = url.searchParams.get('key');
  if (urlKey && env.ADMIN_KEY && timingSafeEqual(urlKey, env.ADMIN_KEY)) {
    auth = {
      userId: env.OWNER_USER_ID ? Number(env.OWNER_USER_ID) : 1,
      isOwner: true,
      isAdmin: true,
      adminRole: 'owner',
    };
  }

  /* 2. admin_key_auth cookie (새 admin login → HMAC-signed) */
  if (!auth.isOwner) {
    const cookieHeader = req.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const adminCookie = cookies.admin_key_auth;
    if (adminCookie && (await verifyAdminKeyToken(adminCookie, env.AUTH_SECRET))) {
      auth = {
        userId: env.OWNER_USER_ID ? Number(env.OWNER_USER_ID) : 1,
        isOwner: true,
        isAdmin: true,
        adminRole: 'owner',
      };
    }
  }

  /* 3. 옛 session cookie + users.is_admin / admin_role (노션 5단계) */
  if (!auth.isOwner) {
    const cookieHeader = req.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const sessionToken = cookies.session;
    if (sessionToken && env.DB) {
      try {
        /* admin_role 컬럼 lazy migration 보장 */
        try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN admin_role TEXT`).run(); } catch {}
        const row = await env.DB.prepare(`
          SELECT s.user_id, u.is_admin, u.admin_role
          FROM sessions s
          JOIN users u ON s.user_id = u.id
          WHERE s.token = ? AND s.expires_at > datetime('now')
        `)
          .bind(sessionToken)
          .first();
        if (row && (row.is_admin || row.admin_role)) {
          const userId = Number(row.user_id);
          /* admin_role 우선 (노션 5단계), 미지정 시 is_admin / user_id=1 fallback */
          let adminRole: string | null = null;
          if (row.admin_role === 'owner' || row.admin_role === 'admin' ||
              row.admin_role === 'editor' || row.admin_role === 'viewer') {
            adminRole = row.admin_role as string;
          } else if (userId === 1 && row.is_admin) {
            adminRole = 'owner';
          } else if (row.is_admin) {
            adminRole = 'admin';
          }
          if (adminRole) {
            auth = {
              userId,
              isOwner: adminRole === 'owner',
              isAdmin: adminRole === 'admin' || adminRole === 'owner',
              adminRole,
            };
          }
        }
      } catch {
        /* graceful */
      }
    }
  }

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({
      db: env.DB,
      bucket: env.MEDIA_BUCKET,
      openaiApiKey: env.OPENAI_API_KEY,
      auth,
    }),
  });
};

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export { handler as GET, handler as POST };
