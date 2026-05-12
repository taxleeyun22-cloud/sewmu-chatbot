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
import { mypageRouter } from './routers/mypage';
import { reviewRouter } from './routers/review';
import { faqRouter } from './routers/faq';
import { bulkSendRouter } from './routers/bulk-send';
import { errorLogsRouter } from './routers/error-logs';
import { auditLogsRouter } from './routers/audit-logs';
import { customerRouter } from './routers/customer';

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
  mypage: mypageRouter,
  review: reviewRouter,
  faq: faqRouter,
  bulkSend: bulkSendRouter,
  errorLogs: errorLogsRouter,
  auditLogs: auditLogsRouter,
  customer: customerRouter,
});

export { audit } from './audit';
export type { AuditOptions } from './audit';

export { logger, logCtx } from './logger';
export type { LogLevel, LogContext, LogEntry } from './logger';

export type AppRouter = typeof appRouter;

export { router, publicProcedure, adminProcedure, ownerProcedure, customerProcedure, withPermission } from './trpc';
export type { Context } from './trpc';
