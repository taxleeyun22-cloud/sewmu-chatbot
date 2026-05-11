/**
 * Phase Next-Day28 (2026-05-11): Cloudflare context wrapper.
 *
 * 옛 functions/api/*.js 는 `(context) => Response` 시그니처 — context.env / context.request.
 * Next.js route.ts 는 `(request: Request) => Response`.
 * 이 wrapper 가 둘을 brigde.
 *
 * 사용: 각 apps/admin/app/api/[endpoint]/route.ts 안에서
 *   `return legacyHandler(legacyFn, request)` 식으로 호출.
 */
import { getRequestContext } from '@cloudflare/next-on-pages';

export type LegacyContext = {
  request: Request;
  env: Record<string, unknown>;
  params?: Record<string, string>;
  waitUntil: (promise: Promise<unknown>) => void;
};

export type LegacyHandler = (context: LegacyContext) => Promise<Response>;

/**
 * 옛 onRequestGet/Post 핸들러를 Next.js route 로 wrap.
 * Cloudflare 의 D1/R2/KV 바인딩을 context.env 로 전달.
 */
export async function callLegacy(
  handler: LegacyHandler,
  request: Request,
  params?: Record<string, string>,
): Promise<Response> {
  // dev / build 시 getRequestContext 가 fail 할 수 있음 (Cloudflare 외 env)
  // graceful fallback — env 가 빈 객체.
  let env: Record<string, unknown> = {};
  let waitUntil: (p: Promise<unknown>) => void = () => {};
  try {
    const cf = getRequestContext();
    env = cf.env as Record<string, unknown>;
    waitUntil = (p) => cf.ctx.waitUntil(p);
  } catch {
    /* graceful */
  }
  const ctx: LegacyContext = {
    request,
    env,
    params: params || {},
    waitUntil,
  };
  return handler(ctx);
}
