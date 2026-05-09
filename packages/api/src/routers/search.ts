/**
 * Phase Next-Day16 (2026-05-09): search router 본격 Drizzle.
 * 기존 functions/api/admin-search.js (전역 검색) 마이그레이션.
 *
 * 6개 그룹: users / businesses / rooms / memos / conversations / documents
 */
import { z } from 'zod';
import { eq, and, or, like, isNull, desc, sql } from 'drizzle-orm';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

export const searchRouter = router({
  global: adminProcedure
    .input(
      z.object({
        query: z.string().min(2).max(100),
        tag: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { users, businesses, chatRooms, memos, conversations } = schema;
      const pat = `%${input.query}%`;
      const limit = input.limit;

      /* 6개 그룹 병렬 fetch */
      const [usersList, businessesList, roomsList, memosList, conversationsList] =
        await Promise.all([
          db
            .select({
              id: users.id,
              real_name: users.real_name,
              name: users.name,
              phone: users.phone,
              email: users.email,
              approval_status: users.approval_status,
            })
            .from(users)
            .where(
              and(
                isNull(users.deleted_at),
                or(
                  like(users.real_name, pat),
                  like(users.name, pat),
                  like(users.phone, pat),
                  like(users.email, pat),
                )!,
              ),
            )
            .limit(limit),

          db
            .select({
              id: businesses.id,
              company_name: businesses.company_name,
              business_number: businesses.business_number,
              ceo_name: businesses.ceo_name,
            })
            .from(businesses)
            .where(
              and(
                isNull(businesses.deleted_at),
                or(
                  like(businesses.company_name, pat),
                  like(businesses.business_number, pat),
                  like(businesses.ceo_name, pat),
                )!,
              ),
            )
            .limit(limit),

          db
            .select({
              id: chatRooms.id,
              name: chatRooms.name,
              status: chatRooms.status,
            })
            .from(chatRooms)
            .where(or(like(chatRooms.id, pat), like(chatRooms.name, pat))!)
            .limit(limit),

          db
            .select({
              id: memos.id,
              content: memos.content,
              category: memos.category,
              tags: memos.tags,
              target_user_id: memos.target_user_id,
              target_business_id: memos.target_business_id,
              room_id: memos.room_id,
              due_date: memos.due_date,
              created_at: memos.created_at,
            })
            .from(memos)
            .where(
              and(
                isNull(memos.deleted_at),
                or(like(memos.content, pat), like(memos.tags, pat))!,
                input.category ? eq(memos.category, input.category) : sql`1=1`,
                input.tag ? like(memos.tags, `%${input.tag}%`) : sql`1=1`,
              ),
            )
            .orderBy(desc(memos.created_at))
            .limit(limit),

          db
            .select({
              id: conversations.id,
              session_id: conversations.session_id,
              role: conversations.role,
              content: conversations.content,
              user_id: conversations.user_id,
              confidence: conversations.confidence,
              created_at: conversations.created_at,
            })
            .from(conversations)
            .where(
              and(isNull(conversations.deleted_at), like(conversations.content, pat)),
            )
            .orderBy(desc(conversations.created_at))
            .limit(limit),
        ]);

      return {
        users: usersList,
        businesses: businessesList,
        rooms: roomsList,
        memos: memosList,
        conversations: conversationsList,
        documents: [], // documents schema 없으면 빈 배열 (Day 17)
      };
    }),
});
