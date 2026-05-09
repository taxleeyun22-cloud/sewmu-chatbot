/**
 * Phase Next-Day20 (2026-05-09): rooms router 본격 Drizzle.
 * 기존 functions/api/admin-rooms.js + admin-room-businesses.js + admin-room-labels.js 마이그레이션.
 *
 * 사장님 매일 워크플로 핵심:
 * - 상담방 list (담당자 라벨 + 미읽음 카운트)
 * - 상담방 진입 → 메시지 + 멤버 + 매핑 업체
 * - 메시지 전송 (사장님 / 직원 / 거래처)
 */
import { z } from 'zod';
import { eq, and, isNull, like, or, desc, asc, sql, inArray } from 'drizzle-orm';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 6자리 코드 생성 (0-9, A-Z, 헷갈리는 문자 제외). */
function generateRoomId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export const roomsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        internal: z.boolean().optional(),
        search: z.string().optional(),
        priority: z
          .array(z.union([z.number(), z.literal('none'), z.literal('closed')]))
          .optional(),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { chatRooms, roomLabels } = schema;

      const conditions = [];
      if (input.internal !== undefined) {
        conditions.push(eq(chatRooms.is_internal, input.internal ? 1 : 0));
      }
      if (input.search) {
        const pat = `%${input.search}%`;
        conditions.push(or(like(chatRooms.id, pat), like(chatRooms.name, pat))!);
      }

      const q = conditions.length
        ? db.select().from(chatRooms).where(and(...conditions))
        : db.select().from(chatRooms);

      const rooms = await q
        .orderBy(desc(chatRooms.updated_at), desc(chatRooms.created_at))
        .limit(input.limit);

      const labels = await db.select().from(roomLabels).orderBy(asc(roomLabels.ord));

      return { rooms, labels };
    }),

  get: adminProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { chatRooms, roomMembers, conversations, users, roomBusinesses, businesses } =
        schema;

      const [roomRows, members, messages, mappedBizs] = await Promise.all([
        db.select().from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1),

        db
          .select({
            id: roomMembers.id,
            user_id: roomMembers.user_id,
            role: roomMembers.role,
            joined_at: roomMembers.joined_at,
            left_at: roomMembers.left_at,
            user_name: users.name,
            user_real_name: users.real_name,
            phone: users.phone,
            is_admin: users.is_admin,
          })
          .from(roomMembers)
          .leftJoin(users, eq(roomMembers.user_id, users.id))
          .where(and(eq(roomMembers.room_id, input.roomId), isNull(roomMembers.left_at))),

        db
          .select({
            id: conversations.id,
            user_id: conversations.user_id,
            role: conversations.role,
            content: conversations.content,
            created_at: conversations.created_at,
            user_name: users.real_name,
          })
          .from(conversations)
          .leftJoin(users, eq(conversations.user_id, users.id))
          .where(
            and(
              eq(conversations.room_id, input.roomId),
              isNull(conversations.deleted_at),
            ),
          )
          .orderBy(asc(conversations.created_at))
          .limit(500),

        db
          .select({
            business_id: roomBusinesses.business_id,
            is_primary: roomBusinesses.is_primary,
            company_name: businesses.company_name,
            business_number: businesses.business_number,
          })
          .from(roomBusinesses)
          .leftJoin(businesses, eq(roomBusinesses.business_id, businesses.id))
          .where(
            and(eq(roomBusinesses.room_id, input.roomId), isNull(roomBusinesses.removed_at)),
          ),
      ]);

      return {
        room: roomRows[0] ?? null,
        members,
        messages,
        businesses: mappedBizs,
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        member_user_ids: z.array(z.number().int().positive()),
        is_internal: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { chatRooms, roomMembers } = schema;

      const now = new Date().toISOString();

      /* 6자리 코드 생성 (collision 시 retry). */
      let roomId = generateRoomId();
      for (let i = 0; i < 5; i++) {
        const exists = await db
          .select()
          .from(chatRooms)
          .where(eq(chatRooms.id, roomId))
          .limit(1);
        if (exists.length === 0) break;
        roomId = generateRoomId();
      }

      await db.insert(chatRooms).values({
        id: roomId,
        name: input.name,
        status: 'active',
        is_internal: input.is_internal ? 1 : 0,
        created_by_user_id: ctx.auth.userId,
        created_at: now,
        updated_at: now,
      });

      /* 멤버 추가 (사장님 자동 + member_user_ids) */
      const memberIds = new Set([...(input.member_user_ids || []), ctx.auth.userId!]);
      for (const userId of memberIds) {
        if (!userId) continue;
        await db.insert(roomMembers).values({
          room_id: roomId,
          user_id: userId,
          role: userId === ctx.auth.userId ? 'admin' : 'member',
          joined_at: now,
        });
      }

      return { ok: true, room_id: roomId };
    }),

  send: adminProcedure
    .input(
      z.object({
        room_id: z.string(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { conversations, chatRooms } = schema;

      const now = new Date().toISOString();
      const r = await db
        .insert(conversations)
        .values({
          room_id: input.room_id,
          user_id: ctx.auth.userId,
          role: 'human_advisor',
          content: input.content,
          created_at: now,
        })
        .returning({ id: conversations.id });

      /* 방 updated_at 갱신 */
      await db
        .update(chatRooms)
        .set({ updated_at: now })
        .where(eq(chatRooms.id, input.room_id));

      return { ok: true, message_id: r[0]?.id ?? 0 };
    }),

  rename: adminProcedure
    .input(z.object({ room_id: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { chatRooms } = schema;
      await db
        .update(chatRooms)
        .set({ name: input.name, updated_at: new Date().toISOString() })
        .where(eq(chatRooms.id, input.room_id));
      return { ok: true };
    }),

  close: adminProcedure
    .input(z.object({ room_id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { chatRooms } = schema;
      const now = new Date().toISOString();
      await db
        .update(chatRooms)
        .set({ status: 'closed', closed_at: now, updated_at: now })
        .where(eq(chatRooms.id, input.room_id));
      return { ok: true };
    }),

  reopen: adminProcedure
    .input(z.object({ room_id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { chatRooms } = schema;
      await db
        .update(chatRooms)
        .set({
          status: 'active',
          closed_at: null,
          updated_at: new Date().toISOString(),
        })
        .where(eq(chatRooms.id, input.room_id));
      return { ok: true };
    }),

  setPriority: adminProcedure
    .input(z.object({ room_id: z.string(), priority: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { chatRooms } = schema;
      await db
        .update(chatRooms)
        .set({ priority: input.priority, updated_at: new Date().toISOString() })
        .where(eq(chatRooms.id, input.room_id));
      return { ok: true };
    }),

  /** 업체 매핑 추가 (1방 N업체). */
  linkBusiness: adminProcedure
    .input(
      z.object({
        room_id: z.string(),
        business_id: z.number().int().positive(),
        is_primary: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { roomBusinesses } = schema;

      const existing = await db
        .select()
        .from(roomBusinesses)
        .where(
          and(
            eq(roomBusinesses.room_id, input.room_id),
            eq(roomBusinesses.business_id, input.business_id),
          ),
        )
        .limit(1);

      const now = new Date().toISOString();
      if (existing[0]) {
        await db
          .update(roomBusinesses)
          .set({
            is_primary: input.is_primary ? 1 : 0,
            removed_at: null,
            linked_at: now,
          })
          .where(eq(roomBusinesses.id, existing[0].id));
      } else {
        await db.insert(roomBusinesses).values({
          room_id: input.room_id,
          business_id: input.business_id,
          is_primary: input.is_primary ? 1 : 0,
          linked_at: now,
        });
      }
      return { ok: true };
    }),

  unlinkBusiness: adminProcedure
    .input(
      z.object({
        room_id: z.string(),
        business_id: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { roomBusinesses } = schema;
      await db
        .update(roomBusinesses)
        .set({ removed_at: new Date().toISOString() })
        .where(
          and(
            eq(roomBusinesses.room_id, input.room_id),
            eq(roomBusinesses.business_id, input.business_id),
          ),
        );
      return { ok: true };
    }),

  /** 라벨 list (담당자 — 예슬/정은/민지/영철 등). */
  labels: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { roomLabels } = schema;
    const labels = await db.select().from(roomLabels).orderBy(asc(roomLabels.ord));
    return { labels };
  }),
});
