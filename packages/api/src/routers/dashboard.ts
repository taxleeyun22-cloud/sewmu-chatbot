/**
 * Phase Next-Day5 (2026-05-09): dashboard router (Drizzle 본격).
 * 사장님 매일 진입 = 핵심 카운트.
 */
import { eq, and, isNull, sql } from 'drizzle-orm';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

export const dashboardRouter = router({
  counts: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { users, businesses, chatRooms, memos } = schema;

    // 병렬 query (Cloudflare D1 호환)
    const [pendingUsersRow, approvedClientsRow, activeRoomsRow, urgentTodosRow] =
      await Promise.all([
        // pending 사용자
        db
          .select({ c: sql<number>`count(*)` })
          .from(users)
          .where(
            and(
              eq(users.approval_status, 'pending'),
              isNull(users.deleted_at),
            ),
          )
          .then((rows) => rows[0]),

        // 기장거래처
        db
          .select({ c: sql<number>`count(*)` })
          .from(users)
          .where(
            and(
              eq(users.approval_status, 'approved_client'),
              isNull(users.deleted_at),
            ),
          )
          .then((rows) => rows[0]),

        // active 상담방
        db
          .select({ c: sql<number>`count(*)` })
          .from(chatRooms)
          .where(eq(chatRooms.status, 'active'))
          .then((rows) => rows[0]),

        // 7일 이내 due_date 메모 (D-day 임박)
        db
          .select({ c: sql<number>`count(*)` })
          .from(memos)
          .where(
            and(
              isNull(memos.deleted_at),
              sql`${memos.due_date} IS NOT NULL`,
              sql`date(${memos.due_date}) <= date('now', '+7 days')`,
              sql`date(${memos.due_date}) >= date('now')`,
              eq(memos.is_checked, 0),
            ),
          )
          .then((rows) => rows[0]),
      ]);

    return {
      pendingUsers: Number(pendingUsersRow?.c || 0),
      approvedClients: Number(approvedClientsRow?.c || 0),
      pendingDocs: 0,  // documents 테이블 — Day 6
      activeRooms: Number(activeRoomsRow?.c || 0),
      unreadMessages: 0,  // 별도 query
      urgentTodos: Number(urgentTodosRow?.c || 0),
      errorLogs: 0,  // error_logs 테이블 (별도)
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
