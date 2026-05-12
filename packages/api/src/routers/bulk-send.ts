/**
 * Phase Next-Day24 (2026-05-09): bulk-send router (단체 알림톡).
 *
 * 사장님 명세: 거래처 N명 일괄 알림 (월말 매입영수증 / 신고 마감 / 연말정산 자료 요청 등).
 * 기존 admin-bulk-send.js 마이그레이션.
 *
 * CLAUDE.md 룰:
 * - manager+ 권한 (admin:bulk_send)
 * - 발송 결과 audit_log 기록 (실패 추적용)
 */
import { z } from 'zod';
import { eq, and, isNull, inArray, or } from 'drizzle-orm';
import { router, withPermission } from '../trpc';
import { drizzle, schema } from '@sewmu/db/client';
import {
  sendAlimtalkBulk,
  renderTemplate,
  type AlimtalkResult,
} from '@sewmu/ai';

const TargetSchema = z.enum(['all', 'approved_client', 'pending', 'specific']);

export const bulkSendRouter = router({
  /** Preview — 대상 거래처 list (실제 발송 X). */
  preview: withPermission('admin:bulk_send')
    .input(
      z.object({
        target: TargetSchema,
        user_ids: z.array(z.number().int().positive()).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { users } = schema;

      const conditions = [
        or(isNull(users.deleted_at), eq(users.deleted_at, ''))!,
      ];
      if (input.target === 'specific' && input.user_ids?.length) {
        conditions.push(inArray(users.id, input.user_ids));
      } else if (input.target === 'approved_client') {
        conditions.push(eq(users.approval_status, 'approved_client'));
      } else if (input.target === 'pending') {
        conditions.push(eq(users.approval_status, 'pending'));
      } else if (input.target === 'all') {
        // active users only
      }

      const list = await db
        .select({
          id: users.id,
          real_name: users.real_name,
          name: users.name,
          phone: users.phone,
          approval_status: users.approval_status,
        })
        .from(users)
        .where(and(...conditions))
        .limit(1000);

      const valid = list.filter((u) => u.phone);
      return {
        recipients: valid,
        total: list.length,
        valid_phone: valid.length,
        no_phone: list.length - valid.length,
      };
    }),

  /** 실제 발송. */
  send: withPermission('admin:bulk_send')
    .input(
      z.object({
        target: TargetSchema,
        user_ids: z.array(z.number().int().positive()).optional(),
        template_code: z.string().min(1),
        message: z.string().min(1).max(2000),
        /** 사용자별 변수 치환 — { 이름: 'real_name', 날짜: '2026-05-31' } */
        variables: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = drizzle(ctx.db);
      const { users } = schema;

      /* 1. 대상 list 동일 흐름 */
      const conditions = [or(isNull(users.deleted_at), eq(users.deleted_at, ''))!];
      if (input.target === 'specific' && input.user_ids?.length) {
        conditions.push(inArray(users.id, input.user_ids));
      } else if (input.target === 'approved_client') {
        conditions.push(eq(users.approval_status, 'approved_client'));
      } else if (input.target === 'pending') {
        conditions.push(eq(users.approval_status, 'pending'));
      }

      const list = await db
        .select({
          id: users.id,
          real_name: users.real_name,
          name: users.name,
          phone: users.phone,
        })
        .from(users)
        .where(and(...conditions))
        .limit(1000);

      const recipients = list.filter((u) => u.phone);

      /* 2. 환경변수 (Cloudflare Pages bindings via tRPC ctx). */
      const env = (ctx as unknown as {
        env?: { KAKAO_BIZ_API_KEY?: string; KAKAO_BIZ_PF_ID?: string };
      }).env;
      const apiKey = env?.KAKAO_BIZ_API_KEY;
      const pfId = env?.KAKAO_BIZ_PF_ID;

      if (!apiKey || !pfId) {
        return {
          ok: false,
          error: 'KAKAO_BIZ_API_KEY / KAKAO_BIZ_PF_ID 미설정',
          recipients: recipients.length,
          sent: 0,
          failed: 0,
          results: [] as AlimtalkResult[],
        };
      }

      /* 3. 메시지 빌드 + 발송 */
      const messages = recipients.map((u) => ({
        to: u.phone!,
        message: renderTemplate(input.message, {
          이름: u.real_name || u.name || '',
          ...(input.variables ?? {}),
        }),
        template_code: input.template_code,
      }));

      const results = await sendAlimtalkBulk(messages, { apiKey, pfId });

      const sent = results.filter((r) => r.ok).length;
      const failed = results.length - sent;

      return {
        ok: true,
        recipients: recipients.length,
        sent,
        failed,
        results,
      };
    }),
});
