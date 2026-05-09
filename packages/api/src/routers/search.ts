/**
 * Phase Next-Week5 (2026-05-09): search router.
 * 기존 functions/api/admin-search.js (전역 검색) 마이그레이션.
 *
 * 7개 그룹: users / rooms / room_messages / conversations / memos / businesses / documents
 */
import { z } from 'zod';
import { adminProcedure, router } from '../trpc';

export const searchRouter = router({
  global: adminProcedure
    .input(
      z.object({
        query: z.string().min(2).max(100),
        tag: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .query(async () => {
      return {
        users: [],
        rooms: [],
        room_messages: [],
        conversations: [],
        memos: [],
        businesses: [],
        documents: [],
      };
    }),
});
