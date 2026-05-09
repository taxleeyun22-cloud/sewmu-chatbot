/**
 * Phase Next-Week2 (2026-05-09): /api/chat — Next.js Route Handler.
 *
 * 마이그레이션 단계:
 *   1. (이번) 기존 functions/api/chat.js 로 forward (proxy)
 *   2. (Week 2 Day 2) tRPC + 직접 OpenAI 호출
 *   3. (Week 2 Day 3) FAQ RAG retrieval (packages/ai)
 *   4. (Week 2 Day 4) 신뢰도 자동 태깅 + flagged-items
 */
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Phase Next-Week2 Day 1: 기존 chat.js 로 forward (호환성 유지)
    // Day 2 부터 tRPC + OpenAI 직접 호출로 변경
    const oldChatRes = await fetch('https://sewmu-chatbot.pages.dev/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // session cookie 등 forward (browser 가 자동 처리)
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify(body),
    });
    const data = await oldChatRes.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: '챗봇 응답 실패',
        message: (err as Error).message,
      },
      { status: 500 },
    );
  }
}
