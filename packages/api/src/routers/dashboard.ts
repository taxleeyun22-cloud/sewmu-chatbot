/**
 * Phase Next-Day18 (2026-05-09): dashboard router 확장 (사장님 매일 KPI).
 *
 * 메인 화면 진입 = 한눈에 사장님이 알아야 할 모든 것:
 * - 미승인 사용자 / 기장거래처 / active 상담방
 * - 미처리 영수증 / 오늘 신고 마감
 * - 검증 대기 AI 답변 / D-day 임박 메모
 * - 최근 메시지 / 업로드 / 메모
 */
import { eq, and, isNull, desc, sql, or } from 'drizzle-orm';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

export const dashboardRouter = router({
  counts: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { users, chatRooms, memos, documents, conversations, filings } = schema;

    const [
      pendingUsersRow,
      approvedClientsRow,
      activeRoomsRow,
      urgentTodosRow,
      pendingDocsRow,
      reviewPendingRow,
      filingsInProgressRow,
    ] = await Promise.all([
      db
        .select({ c: sql<number>`count(*)` })
        .from(users)
        .where(and(eq(users.approval_status, 'pending'), isNull(users.deleted_at)))
        .then((rows) => rows[0]),

      db
        .select({ c: sql<number>`count(*)` })
        .from(users)
        .where(and(eq(users.approval_status, 'approved_client'), isNull(users.deleted_at)))
        .then((rows) => rows[0]),

      db
        .select({ c: sql<number>`count(*)` })
        .from(chatRooms)
        .where(eq(chatRooms.status, 'active'))
        .then((rows) => rows[0]),

      db
        .select({ c: sql<number>`count(*)` })
        .from(memos)
        .where(
          and(
            isNull(memos.deleted_at),
            sql`${memos.due_date} IS NOT NULL`,
            sql`date(${memos.due_date}) <= date('now', '+3 days')`,
            sql`date(${memos.due_date}) >= date('now')`,
            eq(memos.is_checked, 0),
          ),
        )
        .then((rows) => rows[0]),

      db
        .select({ c: sql<number>`count(*)` })
        .from(documents)
        .where(and(eq(documents.status, 'pending'), isNull(documents.deleted_at)))
        .then((rows) => rows[0]),

      db
        .select({ c: sql<number>`count(*)` })
        .from(conversations)
        .where(
          and(
            eq(conversations.role, 'assistant'),
            or(
              sql`${conversations.confidence} IN ('보통','낮음')`,
              eq(conversations.reported, 1),
            )!,
            or(eq(conversations.reviewed, 0), isNull(conversations.reviewed))!,
          ),
        )
        .then((rows) => rows[0]),

      db
        .select({ c: sql<number>`count(*)` })
        .from(filings)
        .where(
          and(
            sql`${filings.deleted_at} IS NULL OR ${filings.deleted_at} = ''`,
            sql`${filings.review_status} IN ('작성중', '결재대기')`,
          ),
        )
        .then((rows) => rows[0]),
    ]);

    return {
      pendingUsers: Number(pendingUsersRow?.c || 0),
      approvedClients: Number(approvedClientsRow?.c || 0),
      pendingDocs: Number(pendingDocsRow?.c || 0),
      activeRooms: Number(activeRoomsRow?.c || 0),
      unreadMessages: 0,
      urgentTodos: Number(urgentTodosRow?.c || 0),
      reviewPending: Number(reviewPendingRow?.c || 0),
      filingsInProgress: Number(filingsInProgressRow?.c || 0),
      errorLogs: 0,
    };
  }),

  recent: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { conversations, documents, memos, users } = schema;

    const [recentMessages, recentUploads, recentMemos] = await Promise.all([
      db
        .select({
          id: conversations.id,
          content: conversations.content,
          role: conversations.role,
          confidence: conversations.confidence,
          user_id: conversations.user_id,
          user_name: users.real_name,
          created_at: conversations.created_at,
        })
        .from(conversations)
        .leftJoin(users, eq(conversations.user_id, users.id))
        .where(isNull(conversations.deleted_at))
        .orderBy(desc(conversations.created_at))
        .limit(10),

      db
        .select({
          id: documents.id,
          doc_type: documents.doc_type,
          status: documents.status,
          vendor: documents.vendor,
          amount: documents.amount,
          user_id: documents.user_id,
          user_name: users.real_name,
          created_at: documents.created_at,
        })
        .from(documents)
        .leftJoin(users, eq(documents.user_id, users.id))
        .where(isNull(documents.deleted_at))
        .orderBy(desc(documents.created_at))
        .limit(10),

      db
        .select({
          id: memos.id,
          content: memos.content,
          category: memos.category,
          due_date: memos.due_date,
          target_user_id: memos.target_user_id,
          target_business_id: memos.target_business_id,
          author_name: memos.author_name,
          created_at: memos.created_at,
        })
        .from(memos)
        .where(isNull(memos.deleted_at))
        .orderBy(desc(memos.created_at))
        .limit(10),
    ]);

    return {
      recentMessages,
      recentUploads,
      recentMemos,
    };
  }),

  /** 사장님 일별 통계 (분석 페이지). */
  daily: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { conversations, documents } = schema;

    const last7days = await db
      .select({
        date: sql<string>`date(${conversations.created_at})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.role, 'assistant'),
          sql`date(${conversations.created_at}) >= date('now', '-7 days')`,
        ),
      )
      .groupBy(sql`date(${conversations.created_at})`)
      .orderBy(sql`date(${conversations.created_at}) DESC`);

    const docsByCategory = await db
      .select({
        category: documents.category,
        count: sql<number>`COUNT(*)`,
        sum: sql<number>`SUM(${documents.amount})`,
      })
      .from(documents)
      .where(
        and(
          eq(documents.status, 'approved'),
          isNull(documents.deleted_at),
          sql`date(${documents.approved_at}) >= date('now', 'start of month')`,
        ),
      )
      .groupBy(documents.category)
      .orderBy(desc(sql`SUM(${documents.amount})`));

    return {
      chatTrend: last7days,
      docsByCategory,
    };
  }),
});
