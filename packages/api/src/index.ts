/**
 * Phase Next-Week2-5 (2026-05-09): @sewmu/api — tRPC routers root.
 *
 * 사용 (apps/admin / apps/customer-web):
 *   import { appRouter, type AppRouter } from '@sewmu/api';
 *
 * Cloudflare Workers 호환 — fetch handler 에 fetchRequestHandler 사용.
 */
import { router } from './trpc';
import { chatRouter } from './routers/chat';
import { usersRouter } from './routers/users';
import { businessesRouter } from './routers/businesses';
import { memosRouter } from './routers/memos';
import { roomsRouter } from './routers/rooms';
import { filingsRouter } from './routers/filings';
import { searchRouter } from './routers/search';
import { documentsRouter } from './routers/documents';
import { dashboardRouter } from './routers/dashboard';

export const appRouter = router({
  chat: chatRouter,
  users: usersRouter,
  businesses: businessesRouter,
  memos: memosRouter,
  rooms: roomsRouter,
  filings: filingsRouter,
  search: searchRouter,
  documents: documentsRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;

export { router, publicProcedure, adminProcedure, ownerProcedure, customerProcedure, withPermission } from './trpc';
export type { Context } from './trpc';
