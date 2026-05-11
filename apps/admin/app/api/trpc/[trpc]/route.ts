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

const handler = async (req: Request) => {
  const env = getCfEnv();

  /* admin_key cookie 검증 */
  const cookieHeader = req.headers.get('cookie') || '';
  const adminCookie = parseCookies(cookieHeader).admin_key_auth;
  const isOwnerByKey = await verifyAdminKeyToken(adminCookie, env.AUTH_SECRET);

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({
      db: env.DB,
      bucket: env.MEDIA_BUCKET,
      openaiApiKey: env.OPENAI_API_KEY,
      auth: isOwnerByKey
        ? {
            userId: env.OWNER_USER_ID ? Number(env.OWNER_USER_ID) : null,
            isOwner: true,
            isAdmin: true,
          }
        : {
            userId: null,
            isOwner: false,
            isAdmin: false,
          },
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
