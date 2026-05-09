/**
 * Phase Next-Day22 (2026-05-09): chatCompletion + extractConfidence 단위 테스트.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { chatCompletion, extractConfidence } from './openai';

describe('extractConfidence', () => {
  it('extracts 높음 from end', () => {
    expect(extractConfidence('답변 본문 [신뢰도: 높음]')).toEqual({
      cleaned: '답변 본문',
      confidence: '높음',
    });
  });

  it('extracts 보통 / 낮음', () => {
    expect(extractConfidence('내용 [신뢰도: 보통]').confidence).toBe('보통');
    expect(extractConfidence('내용 [신뢰도: 낮음]').confidence).toBe('낮음');
  });

  it('handles trailing whitespace', () => {
    expect(extractConfidence('답변 [신뢰도: 높음]   \n').confidence).toBe('높음');
  });

  it('returns null when no confidence tag', () => {
    expect(extractConfidence('일반 답변')).toEqual({
      cleaned: '일반 답변',
      confidence: null,
    });
  });

  it('only matches at the end (mid-text X)', () => {
    expect(
      extractConfidence('처음에 [신뢰도: 높음] 이라고 한 후 추가 설명').confidence,
    ).toBeNull();
  });

  it('handles flexible whitespace inside bracket', () => {
    expect(extractConfidence('답 [신뢰도:높음]').confidence).toBe('높음');
    expect(extractConfidence('답 [신뢰도:   보통]').confidence).toBe('보통');
  });

  it('does not match invalid confidence labels', () => {
    expect(extractConfidence('답 [신뢰도: 매우높음]').confidence).toBeNull();
    expect(extractConfidence('답 [신뢰도: high]').confidence).toBeNull();
  });

  it('empty input', () => {
    expect(extractConfidence('')).toEqual({ cleaned: '', confidence: null });
  });
});

describe('chatCompletion', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('sends POST to OpenAI with correct body', async () => {
    let capturedBody: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = (init as RequestInit).body as string;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'AI 답변' } }],
          usage: { total_tokens: 100 },
          model: 'gpt-4.1-mini',
        }),
      } as unknown as Response;
    });

    const result = await chatCompletion({
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.content).toBe('AI 답변');
    expect(result.tokensUsed).toBe(100);
    expect(result.model).toBe('gpt-4.1-mini');

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.model).toBe('gpt-4.1-mini');
    expect(parsed.temperature).toBe(0.3);
    expect(parsed.max_tokens).toBe(1500);
    expect(parsed.messages).toHaveLength(1);
  });

  it('respects custom model / temperature / maxTokens', async () => {
    let capturedBody: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = (init as RequestInit).body as string;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' } }],
          model: 'gpt-4o',
        }),
      } as unknown as Response;
    });

    await chatCompletion({
      apiKey: 'sk',
      messages: [],
      model: 'gpt-4o',
      temperature: 0,
      maxTokens: 500,
    });

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.model).toBe('gpt-4o');
    expect(parsed.temperature).toBe(0);
    expect(parsed.max_tokens).toBe(500);
  });

  it('throws on non-ok with truncated error body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limit ' + 'x'.repeat(500),
    } as unknown as Response);

    await expect(
      chatCompletion({ apiKey: 'sk', messages: [] }),
    ).rejects.toThrow(/429/);
  });

  it('returns empty string when choices missing (defensive)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [], model: 'gpt-4.1-mini' }),
    } as unknown as Response);

    const r = await chatCompletion({ apiKey: 'sk', messages: [] });
    expect(r.content).toBe('');
  });
});
