/**
 * Phase Next-Week4 (2026-05-09): dashboard router.
 * 사장님 매일 진입 = 핵심 카운트 + 알림.
 */
import { adminProcedure, router } from '../trpc';

export const dashboardRouter = router({
  counts: adminProcedure.query(async () => {
    return {
      pendingUsers: 0,
      approvedClients: 0,
      pendingDocs: 0,
      activeRooms: 0,
      unreadMessages: 0,
      urgentTodos: 0,
      errorLogs: 0,
    };
  }),

  recent: adminProcedure.query(async () => {
    return {
      recentMessages: [],
      recentUploads: [],
      recentMemos: [],
    };
  }),
});
