/**
 * Phase Next-Day22 (2026-05-09): RAG helpers 단위 테스트.
 *
 * cosine / rankFaqsByEmbedding / formatRagContext — 순수 함수.
 * embedQuery — fetch mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cosine,
  embedQuery,
  rankFaqsByEmbedding,
  formatRagContext,
  type FaqRow,
} from './rag';

describe('cosine', () => {
  it('identical vectors → 1', () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosine([0.5, 0.5, 0.5], [0.5, 0.5, 0.5])).toBeCloseTo(1, 5);
  });

  it('opposite vectors → -1', () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('orthogonal → 0', () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  it('zero vector → 0 (no NaN)', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine([1, 1], [0, 0])).toBe(0);
  });

  it('mismatched length → 0', () => {
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  });

  it('empty arrays → 0', () => {
    expect(cosine([], [])).toBe(0);
  });

  it('non-array input → 0 (graceful)', () => {
    expect(cosine(null as unknown as number[], [1, 2])).toBe(0);
    expect(cosine([1, 2], undefined as unknown as number[])).toBe(0);
  });

  it('realistic embedding-like vectors', () => {
    const a = [0.1, 0.2, 0.3, 0.4];
    const b = [0.1, 0.2, 0.3, 0.4];
    expect(cosine(a, b)).toBeCloseTo(1, 5);

    const c = [0.4, 0.3, 0.2, 0.1];
    expect(cosine(a, c)).toBeGreaterThan(0);
    expect(cosine(a, c)).toBeLessThan(1);
  });
});

describe('rankFaqsByEmbedding', () => {
  function makeRow(q: string, embedding: number[] | null): FaqRow {
    return {
      question: q,
      answer: `answer for ${q}`,
      law_refs: 'law',
      embedding: embedding ? JSON.stringify(embedding) : null,
    };
  }

  it('returns top-k highest-scoring above threshold', () => {
    const queryVec = [1, 0, 0];
    const rows = [
      makeRow('Q1 (perfect)', [1, 0, 0]),         // score 1
      makeRow('Q2 (close)', [0.95, 0.1, 0]),       // ~0.99
      makeRow('Q3 (orthogonal)', [0, 1, 0]),       // 0 — filtered
      makeRow('Q4 (similar)', [0.7, 0.3, 0]),     // ~0.92
    ];

    const top = rankFaqsByEmbedding(rows, queryVec, { k: 3, threshold: 0.5 });
    expect(top).toHaveLength(3);
    expect(top[0].question).toBe('Q1 (perfect)');
    expect(top[0].score).toBeCloseTo(1, 5);
    expect(top[1].score).toBeGreaterThan(top[2].score);
    expect(top.every((t) => t.score > 0.5)).toBe(true);
  });

  it('skips rows with null/invalid embedding', () => {
    const rows = [
      makeRow('Q1', [1, 0]),
      makeRow('Q2 no embedding', null),
      { ...makeRow('Q3 broken', null), embedding: 'not-json' },
    ];
    const top = rankFaqsByEmbedding(rows, [1, 0]);
    expect(top).toHaveLength(1);
    expect(top[0].question).toBe('Q1');
  });

  it('respects threshold (0.5 default)', () => {
    const queryVec = [1, 0];
    const rows = [
      makeRow('high', [0.9, 0.1]),
      makeRow('low', [0.3, 0.95]),
    ];
    const top = rankFaqsByEmbedding(rows, queryVec);
    expect(top.find((t) => t.question === 'low')).toBeUndefined();
  });

  it('respects custom k', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow(`Q${i}`, [1 - i * 0.05, i * 0.01]),
    );
    const top = rankFaqsByEmbedding(rows, [1, 0], { k: 5 });
    expect(top).toHaveLength(5);
  });

  it('empty array → empty result', () => {
    expect(rankFaqsByEmbedding([], [1, 0])).toEqual([]);
  });

  it('all below threshold → empty', () => {
    const top = rankFaqsByEmbedding([makeRow('low', [0, 1])], [1, 0]);
    expect(top).toEqual([]);
  });

  it('result includes law_refs when present', () => {
    const rows: FaqRow[] = [
      {
        question: 'Q1',
        answer: 'A1',
        law_refs: '소득세법 제3조',
        embedding: JSON.stringify([1, 0]),
      },
      {
        question: 'Q2',
        answer: 'A2',
        law_refs: null,
        embedding: JSON.stringify([0.9, 0.1]),
      },
    ];
    const top = rankFaqsByEmbedding(rows, [1, 0]);
    expect(top[0].law_refs).toBe('소득세법 제3조');
    expect(top[1].law_refs).toBeNull();
  });
});

describe('formatRagContext', () => {
  it('empty input → empty string', () => {
    expect(formatRagContext([])).toBe('');
  });

  it('single FAQ formatted with header', () => {
    const out = formatRagContext([
      { question: '부가세 신고 기한?', answer: '1/25 4/25 7/25 10/25', law_refs: '부가세법 제49조', score: 0.9 },
    ]);
    expect(out).toContain('[참고 FAQ — 답변 근거 우선 사용]');
    expect(out).toContain('1. 부가세 신고 기한?');
    expect(out).toContain('→ 1/25 4/25 7/25 10/25');
    expect(out).toContain('근거: 부가세법 제49조');
  });

  it('multi FAQ — numbered + double-newline separator', () => {
    const out = formatRagContext([
      { question: 'Q1', answer: 'A1', law_refs: null, score: 0.9 },
      { question: 'Q2', answer: 'A2', law_refs: null, score: 0.8 },
    ]);
    expect(out).toContain('1. Q1');
    expect(out).toContain('2. Q2');
    expect(out.split('\n\n').length).toBeGreaterThan(2);
  });

  it('omits 근거 line when law_refs is null', () => {
    const out = formatRagContext([{ question: 'Q', answer: 'A', law_refs: null, score: 0.9 }]);
    expect(out).not.toContain('근거:');
  });
});

describe('embedQuery', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('returns first embedding from OpenAI response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    } as unknown as Response);

    const v = await embedQuery('sk-test', 'hello');
    expect(v).toEqual([0.1, 0.2, 0.3]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  it('truncates long input to 8000 chars', async () => {
    let capturedBody: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = (init as RequestInit).body as string;
      return {
        ok: true,
        json: async () => ({ data: [{ embedding: [] }] }),
      } as unknown as Response;
    });

    const long = 'a'.repeat(20000);
    await embedQuery('sk-test', long);
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.input.length).toBe(8000);
  });

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response);

    await expect(embedQuery('sk-test', 'x')).rejects.toThrow('429');
  });

  it('returns [] when API returns empty data array (defensive)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as unknown as Response);

    const v = await embedQuery('sk-test', 'x');
    expect(v).toEqual([]);
  });
});
