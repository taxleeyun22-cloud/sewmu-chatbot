/**
 * Phase Next-Day6 (2026-05-09): tRPC HTTP handler (apps/admin).
 *
 * fetch adapter 사용 — Cloudflare Pages 호환.
 * Day 7 Auth.js session 통합 (현재는 stub auth context).
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@sewmu/api';

export const runtime = 'edge';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => {
      // Day 7: Auth.js session 통합
      // const session = await auth();
      // const env = (process as { env: any }).env;
      return {
        db: (process.env as { DB?: any }).DB,
        bucket: (process.env as { MEDIA_BUCKET?: any }).MEDIA_BUCKET,
        openaiApiKey: (process.env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY,
        auth: {
          userId: null,
          isOwner: false,
          isAdmin: false,
          staffRole: null,
        },
      };
    },
  });

export { handler as GET, handler as POST };
