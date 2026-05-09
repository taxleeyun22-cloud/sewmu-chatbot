/**
 * Phase Next-Day5 (2026-05-09): /api/chat 직접 OpenAI 호출 (proxy 폐기).
 *
 * Cloudflare Pages env: OPENAI_API_KEY (사장님이 대시보드에서 설정)
 */
import { NextResponse } from 'next/server';
import { chatCompletion, extractConfidence, buildSystemPrompt } from '@sewmu/ai';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = body.message;
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message 필요' }, { status: 400 });
    }

    const apiKey = (process.env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY 미설정 (사장님 Cloudflare 환경변수 추가 필요)' },
        { status: 500 },
      );
    }

    const systemPrompt = buildSystemPrompt({});

    const result = await chatCompletion({
      apiKey,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });

    const { cleaned, confidence } = extractConfidence(result.content);

    return NextResponse.json({
      response: result.content,
      cleaned,
      confidence,
      tokensUsed: result.tokensUsed,
      model: result.model,
    });
  } catch (err) {
    console.error('[chat] error:', err);
    return NextResponse.json(
      { error: '챗봇 응답 실패', message: (err as Error).message },
      { status: 500 },
    );
  }
}
