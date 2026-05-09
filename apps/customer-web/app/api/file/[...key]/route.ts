/**
 * Phase Next-Day17 (2026-05-09): R2 파일 proxy (영수증 보기).
 *
 * CLAUDE.md 보안 룰:
 * - 인증 필수
 * - 본인 또는 admin 만 본인 documents 접근 가능
 * - URL 에 sensitive 정보 없음 (key 만)
 */
import { auth } from '@/auth';
import { drizzle } from '@sewmu/db/client';
import * as schema from '@sewmu/db';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  try {
    const { key: keyParts } = await params;
    const key = keyParts.join('/');

    /* 인증 */
    const session = await auth();
    const userId = session?.user?.id ? Number((session.user as { id: string }).id) : null;
    if (!userId) {
      return new Response('로그인 필요', { status: 401 });
    }

    const env = (globalThis as any).env || (process as any)?.env || {};
    const bucket = env.MEDIA_BUCKET;
    const d1 = env.DB;

    if (!bucket) {
      return new Response('MEDIA_BUCKET 미설정', { status: 500 });
    }

    /* 권한 체크 — 본인 documents 만 (admin 은 별도 endpoint 사용) */
    if (d1 && key.startsWith('documents/')) {
      const db = drizzle(d1);
      const { documents, users } = schema;

      const doc = await db
        .select({ user_id: documents.user_id })
        .from(documents)
        .where(eq(documents.image_key, key))
        .limit(1);

      const u = await db
        .select({ is_admin: users.is_admin, is_owner: users.is_owner })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const isAdmin = u[0]?.is_admin === 1 || u[0]?.is_owner === 1;
      const ownsDoc = doc[0] && doc[0].user_id === userId;

      if (!isAdmin && !ownsDoc) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    /* R2 fetch */
    const obj = await bucket.get(key);
    if (!obj) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    if (obj.httpMetadata?.contentType) {
      headers.set('Content-Type', obj.httpMetadata.contentType);
    }
    headers.set('Cache-Control', 'private, max-age=300');

    return new Response(obj.body as ReadableStream, { headers });
  } catch (err) {
    console.error('[file] error:', err);
    return new Response('Server error', { status: 500 });
  }
}
