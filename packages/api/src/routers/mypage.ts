/**
 * Phase Next-Day13 (2026-05-09): mypage router (거래처 사장님 마이페이지).
 * 기존 functions/api/my-rooms.js + my-businesses.js 마이그레이션.
 */
import { z } from 'zod';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { customerProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

export const mypageRouter = router({
  /**
   * 마이페이지 통합 데이터 — 1번 fetch 로 모든 영역.
   */
  summary: customerProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { users, businesses, chatRooms, roomMembers, dailyUsage } = schema;

    if (!ctx.auth.userId) {
      return {
        user: null,
        businesses: [],
        rooms: [],
        todayCount: 0,
      };
    }

    const userId = ctx.auth.userId;

    // 사용자 정보
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0]);

    // 매핑 사업장 (business_members JOIN — 향후 schema 추가)
    // 지금은 단순화 — businesses WHERE business_members.user_id 매칭

    // 상담방 (room_members JOIN chat_rooms)
    const myRooms = await db
      .select({
        id: chatRooms.id,
        name: chatRooms.name,
        status: chatRooms.status,
      })
      .from(roomMembers)
      .innerJoin(chatRooms, eq(roomMembers.room_id, chatRooms.id))
      .where(
        and(
          eq(roomMembers.user_id, userId),
          isNull(roomMembers.left_at),
        ),
      );

    // 오늘 사용량
    const today = new Date().toISOString().slice(0, 10);
    const usage = await db
      .select()
      .from(dailyUsage)
      .where(and(eq(dailyUsage.user_id, userId), eq(dailyUsage.date, today)))
      .limit(1)
      .then((rows) => rows[0]);

    return {
      user: user
        ? {
            id: user.id,
            real_name: user.real_name,
            name: user.name,
            phone: user.phone,
            email: user.email,
            approval_status: user.approval_status,
          }
        : null,
      businesses: [],  // Day 14: business_members 테이블 schema 추가 후
      rooms: myRooms,
      todayCount: usage?.count || 0,
    };
  }),
});
