/**
 * Phase Next-Week5 (2026-05-09): rooms router.
 * 기존 functions/api/admin-rooms.js + admin-room-businesses.js + admin-room-labels.js 마이그레이션.
 */
import { z } from 'zod';
import { adminProcedure, router } from '../trpc';

export const roomsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        internal: z.boolean().optional(),
        search: z.string().optional(),
        priority: z.array(z.union([z.number(), z.literal('none'), z.literal('closed')])).optional(),
      }),
    )
    .query(async () => {
      return { rooms: [], labels: [] };
    }),

  get: adminProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async () => {
      return { room: null, members: [], messages: [] };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string(),
        max_members: z.number().int().positive().default(10),
        member_user_ids: z.array(z.number().int().positive()),
      }),
    )
    .mutation(async () => {
      return { ok: true, room_id: '' };
    }),

  send: adminProcedure
    .input(
      z.object({
        room_id: z.string(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async () => {
      return { ok: true, message_id: 0 };
    }),

  rename: adminProcedure
    .input(z.object({ room_id: z.string(), name: z.string() }))
    .mutation(async () => {
      return { ok: true };
    }),

  close: adminProcedure
    .input(z.object({ room_id: z.string() }))
    .mutation(async () => {
      return { ok: true };
    }),

  reopen: adminProcedure
    .input(z.object({ room_id: z.string() }))
    .mutation(async () => {
      return { ok: true };
    }),

  setPriority: adminProcedure
    .input(z.object({ room_id: z.string(), priority: z.number().int() }))
    .mutation(async () => {
      return { ok: true };
    }),
});
