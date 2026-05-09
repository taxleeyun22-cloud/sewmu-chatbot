/**
 * Phase Next-Day22 (2026-05-09): RAG helpers (chat router + customer-web 공유).
 *
 * 단위 테스트 가능 — 순수 함수 + fetch mock.
 */

/** Cosine similarity. -1 ~ 1 (보통 0~1 범위). */
export function cosine(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/** OpenAI 임베딩 호출 (text-embedding-3-small, 1536 dim). */
export async function embedQuery(apiKey: string, text: string): Promise<number[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  });
  if (!r.ok) throw new Error(`embed failed: ${r.status}`);
  const data = (await r.json()) as { data: { embedding: number[] }[] };
  return data.data[0]?.embedding ?? [];
}

export interface FaqRow {
  question: string;
  answer: string;
  law_refs?: string | null;
  embedding?: string | null;
}

export interface ScoredFaq {
  question: string;
  answer: string;
  law_refs: string | null;
  score: number;
}

/**
 * faq rows + queryVec → top-k 점수순 정렬.
 *
 * threshold default 0.5 — 너무 낮으면 noise, 너무 높으면 RAG 0건.
 * 순수 함수 (fetch X) — 단위 테스트 가능.
 */
export function rankFaqsByEmbedding(
  rows: FaqRow[],
  queryVec: number[],
  options: { k?: number; threshold?: number } = {},
): ScoredFaq[] {
  const k = options.k ?? 3;
  const threshold = options.threshold ?? 0.5;

  return rows
    .map((r): ScoredFaq | null => {
      if (!r.embedding) return null;
      let vec: number[];
      try {
        vec = JSON.parse(r.embedding);
      } catch {
        return null;
      }
      if (!Array.isArray(vec) || vec.length === 0) return null;
      return {
        question: r.question,
        answer: r.answer,
        law_refs: r.law_refs ?? null,
        score: cosine(queryVec, vec),
      };
    })
    .filter((x): x is ScoredFaq => x !== null && x.score > threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** RAG context block 생성 (시스템 프롬프트에 inject). */
export function formatRagContext(top: ScoredFaq[]): string {
  if (top.length === 0) return '';
  return (
    '\n\n[참고 FAQ — 답변 근거 우선 사용]\n' +
    top
      .map(
        (f, i) =>
          `${i + 1}. ${f.question}\n   → ${f.answer}${
            f.law_refs ? `\n   근거: ${f.law_refs}` : ''
          }`,
      )
      .join('\n\n')
  );
}
