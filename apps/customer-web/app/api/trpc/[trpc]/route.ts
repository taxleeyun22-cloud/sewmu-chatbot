/**
 * Phase Next-Day6 (2026-05-09): tRPC HTTP handler (apps/customer-web).
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
