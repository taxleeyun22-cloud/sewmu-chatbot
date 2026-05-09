/**
 * Phase Next-Day25 (2026-05-09): Cron — 신고 마감일 임박 자동 알림.
 *
 * Cloudflare Cron Trigger 가 매일 09:00 KST 호출.
 *
 * 흐름:
 * 1. tax_filings 테이블에서 due_date <= 7일 후 + status='pending' 인 항목 조회
 * 2. 해당 사업장의 사장님 (business_members) 에게 카카오 알림톡 발송
 * 3. memos 테이블에 자동 D-day 메모 생성 (사장님 일정에 표시)
 *
 * 인증: x-cron-secret 헤더 (Cloudflare Cron 만 호출 가능)
 *
 * 사장님 등록 필요:
 *   wrangler.toml or Cloudflare Dashboard → Cron Triggers
 *   schedule: "0 0 * * *" (UTC 00:00 = KST 09:00)
 *   path: /api/cron/filing-deadlines
 */
import { drizzle } from '@sewmu/db/client';
import * as schema from '@sewmu/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { sendAlimtalk, renderTemplate } from '@sewmu/ai';

export const runtime = 'edge';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CronResult {
  ok: boolean;
  date: string;
  filings_due: number;
  alimtalks_sent: number;
  alimtalks_failed: number;
  memos_created: number;
  error?: string;
}

export async function GET(request: Request): Promise<Response> {
  return runCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return runCron(request);
}

async function runCron(request: Request): Promise<Response> {
  try {
    const env = (globalThis as any).env || (process as any)?.env || {};

    /* Cron secret 검증 */
    const secret = request.headers.get('x-cron-secret');
    if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const d1 = env.DB;
    if (!d1) {
      return Response.json({ error: 'DB binding missing' }, { status: 500 });
    }

    const db = drizzle(d1);
    const { taxFilings, businesses, users } = schema;

    /* 7일 이내 due 인 미완료 신고 항목 */
    const filings = await db
      .select({
        id: taxFilings.id,
        business_id: taxFilings.business_id,
        user_id: taxFilings.user_id,
        filing_type: taxFilings.filing_type,
        period_label: taxFilings.period_label,
        due_date: taxFilings.due_date,
      })
      .from(taxFilings)
      .where(
        and(
          eq(taxFilings.status, 'pending'),
          sql`date(${taxFilings.due_date}) <= date('now', '+7 days')`,
          sql`date(${taxFilings.due_date}) >= date('now')`,
        ),
      );

    const result: CronResult = {
      ok: true,
      date: new Date().toISOString().slice(0, 10),
      filings_due: filings.length,
      alimtalks_sent: 0,
      alimtalks_failed: 0,
      memos_created: 0,
    };

    if (filings.length === 0) {
      return Response.json(result);
    }

    /* 각 filing → 알림톡 + 메모 */
    const apiKey = env.KAKAO_BIZ_API_KEY;
    const pfId = env.KAKAO_BIZ_PF_ID;

    for (const f of filings) {
      const dDays = daysUntil(f.due_date);
      const businessName = await fetchBusinessName(db, f.business_id);
      const owner = await fetchPrimaryOwner(d1, f.business_id);

      /* 알림톡 — 사장님 (사업주) 에게 */
      if (apiKey && pfId && owner?.phone) {
        const r = await sendAlimtalk(
          {
            to: owner.phone,
            template_code: 'TPL_DEADLINE',
            message: renderTemplate(
              '#{이름}님, #{업체명}의 #{유형} 신고 마감이 #{D}일 후 (#{날짜}) 입니다.',
              {
                이름: owner.real_name || owner.name || '사장님',
                업체명: businessName || '귀하 업체',
                유형: f.filing_type || '세무',
                D: String(dDays),
                날짜: f.due_date || '',
              },
            ),
          },
          { apiKey, pfId, allowAfterHours: false },
        );
        if (r.ok) result.alimtalks_sent++;
        else result.alimtalks_failed++;
      }

      /* memos — 사장님 일정 (assigned_to_user_id = owner.id) */
      try {
        await db.insert(schema.memos).values({
          target_business_id: f.business_id,
          assigned_to_user_id: owner?.id ?? null,
          content: `[자동 D-${dDays}] ${f.filing_type} 신고 마감 — ${f.period_label || ''}`,
          category: '약속',
          due_date: f.due_date,
          author_name: '시스템 자동',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        result.memos_created++;
      } catch {
        /* skip on error */
      }
    }

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

function daysUntil(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((due - now) / 86400000));
}

async function fetchBusinessName(db: any, businessId: number | null): Promise<string | null> {
  if (!businessId) return null;
  try {
    const r = await db
      .select({ name: schema.businesses.company_name })
      .from(schema.businesses)
      .where(eq(schema.businesses.id, businessId))
      .limit(1);
    return r[0]?.name ?? null;
  } catch {
    return null;
  }
}

async function fetchPrimaryOwner(
  d1: any,
  businessId: number | null,
): Promise<{ id: number; real_name: string | null; name: string | null; phone: string | null } | null> {
  if (!businessId) return null;
  try {
    const r = await d1
      .prepare(
        `SELECT u.id, u.real_name, u.name, u.phone
         FROM business_members bm
         INNER JOIN users u ON u.id = bm.user_id
         WHERE bm.business_id = ?
           AND (bm.removed_at IS NULL OR bm.removed_at = '')
         ORDER BY bm.is_primary DESC LIMIT 1`,
      )
      .bind(businessId)
      .first();
    return r ?? null;
  } catch {
    return null;
  }
}
