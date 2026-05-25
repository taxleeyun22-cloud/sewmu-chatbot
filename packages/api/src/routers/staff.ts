/**
 * Phase 담당자-1 (2026-05-25): staff 라우터 — 담당 직원 목록 + 거래처/업체 담당자 지정.
 *
 * 사장님 명령: "개인업체마다 담당자 수동지정 → 연결된 (개인)업체도 자동 배정 / 법인은 따로 수정".
 * - list: is_admin=1 직원 (담당자 후보) 목록
 * - setAssignee: 거래처(user) 또는 업체(business) 담당자 지정
 *   - user 지정 시 → 연결된 개인사업자 업체(business_members) 자동 상속 (법인 제외, 독립)
 *
 * staff_user_id 컬럼은 lazy ALTER (users/businesses) — 옛 admin 호환.
 */
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { adminProcedure, router } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';
import { audit } from '../audit';

type D1Like = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => { run: () => Promise<unknown> };
    run: () => Promise<unknown>;
  };
};

/** staff_user_id 컬럼 lazy 보장 (users + businesses). 이미 있으면 ALTER 실패 → catch. */
async function ensureStaffColumns(d1: D1Like) {
  try { await d1.prepare(`ALTER TABLE users ADD COLUMN staff_user_id INTEGER`).run(); } catch {}
  try { await d1.prepare(`ALTER TABLE businesses ADD COLUMN staff_user_id INTEGER`).run(); } catch {}
}

export const staffRouter = router({
  /** 담당자 후보 = 직원(is_admin=1) 목록 */
  list: adminProcedure.query(async ({ ctx }) => {
    const db = drizzle(ctx.db);
    const { users } = schema;
    const rows = await db
      .select({ id: users.id, name: users.name, real_name: users.real_name })
      .from(users)
      .where(eq(users.is_admin, 1));
    return {
      staff: rows.map((r) => ({ id: r.id, name: r.real_name || r.name || `#${r.id}` })),
    };
  }),

  /** 거래처(user) 또는 업체(business) 담당자 지정.
   *  user 지정 시 → 연결된 개인사업자 업체로 자동 상속 (법인 제외). staffUserId=null 이면 해제. */
  setAssignee: adminProcedure
    .input(
      z.object({
        targetType: z.enum(['user', 'business']),
        targetId: z.number().int().positive(),
        staffUserId: z.number().int().positive().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const d1 = ctx.db as unknown as D1Like;
      await ensureStaffColumns(d1);
      const now = new Date().toISOString();
      const sid = input.staffUserId;

      let propagated = 0;
      if (input.targetType === 'business') {
        /* 업체 단위 — 법인은 여기서 독립 지정/수정 */
        await d1
          .prepare(`UPDATE businesses SET staff_user_id = ?, updated_at = ? WHERE id = ?`)
          .bind(sid, now, input.targetId)
          .run();
      } else {
        /* 거래처(사람) 단위 */
        await d1
          .prepare(`UPDATE users SET staff_user_id = ? WHERE id = ?`)
          .bind(sid, input.targetId)
          .run();
        /* 연결된 개인사업자 업체로 상속 (법인 제외). business_members = 사람↔업체 N:N. */
        const r = (await d1
          .prepare(
            `UPDATE businesses SET staff_user_id = ?, updated_at = ?
             WHERE id IN (SELECT business_id FROM business_members WHERE user_id = ?)
               AND COALESCE(company_form, '') NOT LIKE '%법인%'`,
          )
          .bind(sid, now, input.targetId)
          .run()) as { meta?: { changes?: number } };
        propagated = r?.meta?.changes ?? 0;
      }

      await audit(ctx, 'staff.setAssignee', {
        target_type: input.targetType,
        target_id: input.targetId,
        after: { staff_user_id: sid, propagated_businesses: propagated },
      });

      return { ok: true, propagated };
    }),
});
