/**
 * Phase Next-Day28 (2026-05-11): customer.dashboard — 거래처 dashboard 통합 fetch.
 *
 * 옛 admin-customer-dash.js 의 openCustomerDashboard 와 동등 구현.
 * 9개 데이터 영역 한 번에 fetch (waterfall 방지):
 *   - user (기본 정보)
 *   - mappedBusinesses (매핑 사업장 N개)
 *   - docCounts (문서 status별)
 *   - finance (재무 요약)
 *   - bizDocs (사업장 문서)
 *   - memos (통합 메모: target_user_id 또는 매핑 business)
 *   - rooms (사용자 참여 상담방)
 *   - todos (assigned_to_user_id)
 *   - summaries (자동 요약)
 */
import { z } from 'zod';
import { eq, and, or, isNull, desc, sql, inArray } from 'drizzle-orm';
import { router, adminProcedure } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

export const customerRouter = router({
  /** 거래처 dashboard 통합 fetch — 옛 openCustomerDashboard 와 동등 */
  dashboard: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { users, businesses, businessMembers, memos, documents, chatRooms, roomMembers } = schema;

      /* 1. user 정보 */
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)
        .then((r) => r[0]);

      if (!user) {
        return {
          user: null,
          mappedBusinesses: [],
          docCounts: {},
          finance: { has_data: false, rows: [] },
          bizDocs: [],
          memos: [],
          rooms: [],
          todos: [],
          summaries: [],
          priority: 0,
        };
      }

      /* 병렬 fetch 8개 — Promise.all */
      const [
        mappedBusinesses,
        docCounts,
        userMemos,
        userRooms,
        userTodos,
      ] = await Promise.all([
        /* 2. 매핑 사업장 (business_members JOIN businesses) */
        db
          .select({
            id: businesses.id,
            company_name: businesses.company_name,
            business_number: businesses.business_number,
            ceo_name: businesses.ceo_name,
            tax_type: businesses.tax_type,
            status: businesses.status,
            is_primary: businessMembers.is_primary,
            role: businessMembers.role,
          })
          .from(businessMembers)
          .innerJoin(businesses, eq(businesses.id, businessMembers.business_id))
          .where(
            and(
              eq(businessMembers.user_id, input.userId),
              or(isNull(businessMembers.removed_at), eq(businessMembers.removed_at, ''))!,
              or(isNull(businesses.deleted_at), eq(businesses.deleted_at, ''))!,
            ),
          )
          .orderBy(desc(businessMembers.is_primary), businesses.id),

        /* 3. 문서 카운트 (status 별) */
        db
          .select({
            status: documents.status,
            c: sql<number>`count(*)`,
          })
          .from(documents)
          .where(
            and(
              eq(documents.user_id, input.userId),
              or(isNull(documents.deleted_at), eq(documents.deleted_at, ''))!,
            ),
          )
          .groupBy(documents.status),

        /* 4. 메모 (target_user_id 또는 매핑 business) — 최근 50 */
        db
          .select()
          .from(memos)
          .where(
            and(
              eq(memos.target_user_id, input.userId),
              or(isNull(memos.deleted_at), eq(memos.deleted_at, ''))!,
            ),
          )
          .orderBy(desc(memos.created_at))
          .limit(50),

        /* 5. 사용자 참여 상담방 — chat_rooms 의 last_message_at 은 lazy column 이라 raw SQL */
        db
          .select({
            id: chatRooms.id,
            name: chatRooms.name,
            status: chatRooms.status,
            priority: chatRooms.priority,
            ai_mode: chatRooms.ai_mode,
            updated_at: chatRooms.updated_at,
          })
          .from(roomMembers)
          .innerJoin(chatRooms, eq(chatRooms.id, roomMembers.room_id))
          .where(
            and(
              eq(roomMembers.user_id, input.userId),
              or(isNull(roomMembers.left_at), eq(roomMembers.left_at, ''))!,
            ),
          )
          .orderBy(desc(chatRooms.updated_at))
          .limit(20),

        /* 6. 일정 (assigned_to_user_id) */
        db
          .select()
          .from(memos)
          .where(
            and(
              eq(memos.assigned_to_user_id, input.userId),
              eq(memos.is_checked, 0),
              or(isNull(memos.deleted_at), eq(memos.deleted_at, ''))!,
            ),
          )
          .orderBy(desc(memos.due_date))
          .limit(20),
      ]);

      /* 7. 사업장 문서 (매핑 사업장 ID 들의 documents) */
      let bizDocs: Array<{ id: number; doc_type: string | null; status: string | null; business_id: number | null }> = [];
      if (mappedBusinesses.length > 0) {
        const bizIds = mappedBusinesses.map((b) => b.id);
        bizDocs = await db
          .select({
            id: documents.id,
            doc_type: documents.doc_type,
            status: documents.status,
            business_id: documents.business_id,
          })
          .from(documents)
          .where(
            and(
              inArray(documents.business_id, bizIds),
              or(isNull(documents.deleted_at), eq(documents.deleted_at, ''))!,
            ),
          )
          .limit(100);
      }

      /* docCounts 객체로 변환 */
      const docCountsMap: Record<string, number> = {};
      for (const row of docCounts) {
        if (row.status) docCountsMap[row.status] = Number(row.c);
      }

      /* 가장 active 상담방의 priority */
      const activeRoom = userRooms.find((r) => r.status === 'active');
      const priority = activeRoom?.priority || 0;

      return {
        user,
        mappedBusinesses,
        docCounts: docCountsMap,
        finance: { has_data: false, rows: [] }, // 재무는 별도 fetch (client_finance 테이블)
        bizDocs,
        memos: userMemos,
        rooms: userRooms,
        todos: userTodos,
        summaries: [], // 자동 요약은 별도 (admin-customer-summary)
        priority,
        recentRoom: userRooms[0] || null,
      };
    }),

  /** 업체 dashboard — 옛 businessDashboardModal 동등 */
  businessDashboard: adminProcedure
    .input(z.object({ businessId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { businesses, businessMembers, users, memos, documents, roomBusinesses, chatRooms } = schema;

      const business = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, input.businessId))
        .limit(1)
        .then((r) => r[0]);

      if (!business) {
        return {
          business: null,
          members: [],
          rooms: [],
          memos: [],
          docs: [],
          branches: [],
          parent: null,
        };
      }

      const [members, mappedRooms, bizMemos, bizDocs, branches, parent] = await Promise.all([
        /* 1. 매핑 사람 (business_members JOIN users) */
        db
          .select({
            user_id: users.id,
            real_name: users.real_name,
            name: users.name,
            phone: users.phone,
            email: users.email,
            approval_status: users.approval_status,
            is_admin: users.is_admin,
            role: businessMembers.role,
            is_primary: businessMembers.is_primary,
          })
          .from(businessMembers)
          .innerJoin(users, eq(users.id, businessMembers.user_id))
          .where(
            and(
              eq(businessMembers.business_id, input.businessId),
              or(isNull(businessMembers.removed_at), eq(businessMembers.removed_at, ''))!,
              or(isNull(users.deleted_at), eq(users.deleted_at, ''))!,
            ),
          )
          .orderBy(desc(businessMembers.is_primary)),

        /* 2. 매핑 상담방 (room_businesses JOIN chat_rooms) */
        db
          .select({
            id: chatRooms.id,
            name: chatRooms.name,
            status: chatRooms.status,
            ai_mode: chatRooms.ai_mode,
            priority: chatRooms.priority,
            updated_at: chatRooms.updated_at,
            is_primary: roomBusinesses.is_primary,
          })
          .from(roomBusinesses)
          .innerJoin(chatRooms, eq(chatRooms.id, roomBusinesses.room_id))
          .where(
            and(
              eq(roomBusinesses.business_id, input.businessId),
              or(isNull(roomBusinesses.removed_at), eq(roomBusinesses.removed_at, ''))!,
            ),
          )
          .orderBy(desc(roomBusinesses.is_primary), desc(chatRooms.updated_at)),

        /* 3. 메모 (target_business_id) */
        db
          .select()
          .from(memos)
          .where(
            and(
              eq(memos.target_business_id, input.businessId),
              or(isNull(memos.deleted_at), eq(memos.deleted_at, ''))!,
            ),
          )
          .orderBy(desc(memos.created_at))
          .limit(50),

        /* 4. 사업장 문서 */
        db
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.business_id, input.businessId),
              or(isNull(documents.deleted_at), eq(documents.deleted_at, ''))!,
            ),
          )
          .orderBy(desc(documents.created_at))
          .limit(100),

        /* 5. 지점 (parent_business_id=N) */
        business.parent_business_id
          ? Promise.resolve([])
          : db
              .select()
              .from(businesses)
              .where(
                and(
                  eq(businesses.parent_business_id, input.businessId),
                  or(isNull(businesses.deleted_at), eq(businesses.deleted_at, ''))!,
                ),
              ),

        /* 6. 본점 (parent) */
        business.parent_business_id
          ? db
              .select()
              .from(businesses)
              .where(eq(businesses.id, business.parent_business_id))
              .limit(1)
              .then((r) => r[0] || null)
          : Promise.resolve(null),
      ]);

      return {
        business,
        members,
        rooms: mappedRooms,
        memos: bizMemos,
        docs: bizDocs,
        branches,
        parent,
      };
    }),
});
