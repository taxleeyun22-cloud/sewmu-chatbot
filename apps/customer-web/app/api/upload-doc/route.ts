/**
 * Phase Next-Day17 (2026-05-09): R2 영수증 업로드 endpoint.
 *
 * 거래처가 영수증 사진/PDF 업로드 → R2 저장 → documents 테이블 INSERT.
 * OCR 자동 분석은 별도 endpoint (Day 18+ Vision API 통합).
 *
 * CLAUDE.md 보안 룰:
 * - 인증 필수 (Auth.js session)
 * - MIME 화이트리스트
 * - 크기 한도 10MB
 * - R2 키 CSPRNG (crypto.randomUUID)
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { drizzle } from '@sewmu/db/client';
import * as schema from '@sewmu/db';

export const runtime = 'edge';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    /* 1. 인증 */
    const session = await auth();
    const userId = session?.user?.id ? Number((session.user as { id: string }).id) : null;
    if (!userId) {
      return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    }

    /* 2. multipart/form-data 파싱 */
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const businessIdRaw = formData.get('business_id') as string | null;
    const docType = (formData.get('doc_type') as string | null) || '영수증';
    const roomId = formData.get('room_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'file 필요' }, { status: 400 });
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json(
        { error: `지원 안 함: ${file.type}` },
        { status: 415 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `용량 초과 (${(file.size / 1024 / 1024).toFixed(1)}MB / 10MB)` },
        { status: 413 },
      );
    }

    /* 3. R2 binding */
    const env = (globalThis as any).env || (process as any)?.env || {};
    const bucket = env.MEDIA_BUCKET;
    const d1 = env.DB;

    if (!bucket) {
      return NextResponse.json(
        { error: 'MEDIA_BUCKET R2 binding 미설정' },
        { status: 500 },
      );
    }

    /* 4. R2 key 생성 (CSPRNG) */
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin';
    const key = `documents/${userId}/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;

    /* 5. R2 업로드 */
    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    /* 6. documents 테이블 INSERT */
    let documentId: number | null = null;
    if (d1) {
      const db = drizzle(d1);
      const { documents } = schema;
      const r = await db
        .insert(documents)
        .values({
          user_id: userId,
          business_id: businessIdRaw ? Number(businessIdRaw) : null,
          room_id: roomId ?? null,
          doc_type: docType,
          image_key: key,
          ocr_status: 'pending',
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .returning({ id: documents.id });
      documentId = r[0]?.id ?? null;
    }

    return NextResponse.json({
      ok: true,
      key,
      name: file.name,
      size: file.size,
      mime: file.type,
      document_id: documentId,
    });
  } catch (err) {
    console.error('[upload-doc] error:', err);
    return NextResponse.json(
      { error: '업로드 실패', message: (err as Error).message },
      { status: 500 },
    );
  }
}
