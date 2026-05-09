/**
 * Phase Next-Day24 (2026-05-09): /api/filing-pdf/[id] — 신고 검토표 HTML/PDF.
 *
 * GET /api/filing-pdf/123 → HTML 응답
 *   브라우저에서 Cmd/Ctrl+P → PDF 저장 (사장님 워크플로 단순).
 *   향후 Cloudflare Browser Rendering 또는 Puppeteer 통합으로 직접 PDF 응답.
 */
import { drizzle } from '@sewmu/db/client';
import * as schema from '@sewmu/db';
import { eq, and, sql } from 'drizzle-orm';
import { renderFilingHtml } from '@sewmu/ai';

export const runtime = 'edge';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) {
      return new Response('id required', { status: 400 });
    }

    /* admin_key 검증 (Cloudflare 환경변수). */
    const adminKey =
      request.headers.get('x-admin-key') ||
      new URL(request.url).searchParams.get('key');
    const env = (globalThis as any).env || (process as any)?.env || {};
    const expectedKey = env.ADMIN_KEY;
    if (!adminKey || adminKey !== expectedKey) {
      return new Response('admin only', { status: 401 });
    }

    const d1 = env.DB;
    if (!d1) {
      return new Response('DB binding missing', { status: 500 });
    }

    const db = drizzle(d1);
    const { filings, users, businesses } = schema;

    /* Filing + 작년 자동 참조 */
    const filing = await db
      .select()
      .from(filings)
      .where(eq(filings.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!filing) {
      return new Response('filing not found', { status: 404 });
    }

    const previous = await db
      .select()
      .from(filings)
      .where(
        and(
          eq(filings.type, filing.type),
          eq(filings.owner_type, filing.owner_type),
          eq(filings.owner_id, filing.owner_id),
          eq(filings.fiscal_year, filing.fiscal_year - 1),
          sql`${filings.deleted_at} IS NULL OR ${filings.deleted_at} = ''`,
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    /* Owner display name */
    let ownerName: string | undefined;
    if (filing.owner_type === 'Person') {
      const u = await db
        .select({ real_name: users.real_name, name: users.name })
        .from(users)
        .where(eq(users.id, filing.owner_id))
        .limit(1);
      ownerName = u[0]?.real_name || u[0]?.name || undefined;
    } else if (filing.owner_type === 'Business') {
      const b = await db
        .select({ company_name: businesses.company_name })
        .from(businesses)
        .where(eq(businesses.id, filing.owner_id))
        .limit(1);
      ownerName = b[0]?.company_name;
    }

    /* Reviewer name (옵션) */
    let reviewerName: string | undefined;
    if (filing.reviewer_user_id) {
      const r = await db
        .select({ real_name: users.real_name, name: users.name })
        .from(users)
        .where(eq(users.id, filing.reviewer_user_id))
        .limit(1);
      reviewerName = r[0]?.real_name || r[0]?.name || undefined;
    }

    const html = renderFilingHtml({
      filing,
      previous,
      ownerName,
      reviewerName,
    });

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[filing-pdf] error:', err);
    return new Response('Server error', { status: 500 });
  }
}
