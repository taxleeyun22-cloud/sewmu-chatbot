// RAG (Retrieval-Augmented Generation) 헬퍼
// D1에 FAQ + 임베딩 저장 → 사용자 질문 시 유사도 top-K만 추출
//
// 사용 흐름:
//   1) 마이그레이션 단계에서 각 FAQ 임베딩을 D1 `faqs.embedding` 에 JSON 문자열로 저장
//   2) chat 요청 시 retrieveTopK(db, env, userQuery, 5) 호출 → 관련 FAQ 5개 반환
//   3) 반환된 FAQ를 system prompt에 주입

const EMBED_MODEL = "text-embedding-3-small"; // 1536차원, 저렴
const EMBED_DIM = 1536;

// OpenAI 임베딩 API 호출
export async function embed(text, env) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 없음");
  const cleaned = String(text || "").slice(0, 8000); // 토큰 제한 보호
  if (!cleaned) return null;

  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: cleaned,
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`embedding API ${r.status}: ${err.slice(0, 200)}`);
  }
  const d = await r.json();
  return d.data?.[0]?.embedding || null;
}

// 코사인 유사도 (정규화된 벡터 가정, 내적이 곧 유사도)
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb);
  return mag === 0 ? 0 : dot / mag;
}

// 테이블 보장 (lazy migration)
export async function ensureFaqsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      q_number INTEGER,
      category TEXT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      law_refs TEXT,
      embedding TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs(active)`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_faqs_qnum ON faqs(q_number)`).run(); } catch {}
}

// 사용자 질문과 가장 유사한 FAQ top K 반환
// 반환: [{id, q_number, category, question, answer, law_refs, score}]
export async function retrieveTopK(db, env, userQuery, k = 5) {
  if (!db || !userQuery) return [];
  try {
    await ensureFaqsTable(db);
    const queryVec = await embed(userQuery, env);
    if (!queryVec) return [];

    // 활성 FAQ 전부 로드 (86~500 규모에선 충분히 빠름)
    const { results } = await db.prepare(`
      SELECT id, q_number, category, question, answer, law_refs, embedding
      FROM faqs
      WHERE active = 1 AND embedding IS NOT NULL
    `).all();

    if (!results || results.length === 0) return [];

    const scored = [];
    for (const row of results) {
      try {
        const v = JSON.parse(row.embedding);
        const score = cosineSimilarity(queryVec, v);
        scored.push({
          id: row.id,
          q_number: row.q_number,
          category: row.category,
          question: row.question,
          answer: row.answer,
          law_refs: row.law_refs,
          score,
        });
      } catch {}
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  } catch (e) {
    console.error("retrieveTopK error:", e.message);
    return [];
  }
}

// 단일 FAQ에 대한 임베딩 재생성 (관리자 UI에서 수정/추가 시)
export async function reembed(db, env, faqId) {
  const row = await db.prepare(`SELECT question, answer FROM faqs WHERE id = ?`).bind(faqId).first();
  if (!row) throw new Error("FAQ not found");
  const text = `${row.question}\n${row.answer}`;
  const v = await embed(text, env);
  if (!v) throw new Error("embedding failed");
  const now = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
  await db.prepare(`UPDATE faqs SET embedding = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(v), now, faqId).run();
  return true;
}

// FAQ 선택 결과를 system prompt에 넣을 포맷으로 변환
export function formatRetrievedFAQs(items) {
  if (!items || items.length === 0) return "";
  const lines = items.map(x => {
    const qn = x.q_number ? `Q${x.q_number}` : "Q";
    return `[${qn}. ${x.question}]\n${x.answer}${x.law_refs ? `\n근거: ${x.law_refs}` : ""}`;
  });
  return `===== 관련 FAQ (의미 유사도 기반 자동 선별) =====\n\n${lines.join("\n\n")}\n\n===== /관련 FAQ =====`;
}
