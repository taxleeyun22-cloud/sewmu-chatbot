/**
 * Phase Next-Week2 Day 2 (2026-05-09): OpenAI client wrapper.
 *
 * 기존 chat.js 의 OpenAI 호출 로직 재사용 + Cloudflare Workers 호환.
 *
 * 사용:
 *   const res = await chatCompletion({ messages, openai_api_key });
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  tokensUsed?: number;
  model: string;
}

/**
 * OpenAI Chat Completions API 호출.
 * 기본: GPT-4.1-mini (저비용, 빠름).
 */
export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const model = opts.model || 'gpt-4.1-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1500,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${txt.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { total_tokens: number };
    model: string;
  };

  return {
    content: data.choices[0]?.message?.content || '',
    tokensUsed: data.usage?.total_tokens,
    model: data.model,
  };
}

/**
 * 답변 끝 [신뢰도: 높음/보통/낮음] 자동 추출.
 */
export function extractConfidence(content: string): {
  cleaned: string;
  confidence: '높음' | '보통' | '낮음' | null;
} {
  const match = content.match(/\[신뢰도:\s*(높음|보통|낮음)\]\s*$/);
  if (!match) return { cleaned: content, confidence: null };
  return {
    cleaned: content.replace(/\[신뢰도:\s*(높음|보통|낮음)\]\s*$/, '').trim(),
    confidence: match[1] as '높음' | '보통' | '낮음',
  };
}
