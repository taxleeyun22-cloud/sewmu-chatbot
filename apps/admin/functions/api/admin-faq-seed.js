// FAQ 배치 시드 일괄 로딩 (owner 전용)
// 시드 파일(_faq-seed-batch-1.js 등)을 읽어서 D1에 INSERT + 임베딩 생성
// 동일 question 이미 존재 시 스킵

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";
import { ensureFaqsTable, embed } from "./_rag.js";
import { SEED_BATCH_1 } from "./_faq-seed-batch-1.js";

const BATCHES = {
  "1": { name: "배치 1 — 간이과세·양도세·연말정산·퇴직금·증여세 (50)", data: SEED_BATCH_1 },
};

function kst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  // 사용 가능한 배치 목록 반환
  const list = Object.entries(BATCHES).map(([id, b]) => ({
    id, name: b.name, count: b.data.length,
  }));
  return Response.json({ batches: list });
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 없음" }, { status: 500 });
  await ensureFaqsTable(db);

  const url = new URL(context.request.url);
  const batchId = url.searchParams.get("batch") || "1";
  const batch = BATCHES[batchId];
  if (!batch) return Response.json({ error: "존재하지 않는 배치: " + batchId }, { status: 400 });

  const now = kst();
  let inserted = 0, skipped = 0, embedded = 0, failed = 0;
  const errors = [];

  // 다음 q_number
  const maxR = await db.prepare(`SELECT COALESCE(MAX(q_number), 0) as m FROM faqs`).first();
  let nextQ = (maxR?.m || 0) + 1;

  for (const item of batch.data) {
    try {
      // 동일 question 있으면 스킵
      const dup = await db.prepare(`SELECT id FROM faqs WHERE question = ?`).bind(item.question).first();
      if (dup) { skipped++; continue; }

      const r = await db.prepare(
        `INSERT INTO faqs (q_number, category, question, answer, law_refs, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(nextQ, item.category, item.question, item.answer, item.law_refs || null, now, now).run();
      const id = r.meta.last_row_id;
      inserted++;
      nextQ++;

      // 임베딩 생성
      try {
        const vec = await embed(`${item.question}\n${item.answer}`, context.env);
        if (vec) {
          await db.prepare(`UPDATE faqs SET embedding = ? WHERE id = ?`)
            .bind(JSON.stringify(vec), id).run();
          embedded++;
        }
      } catch (e) {
        errors.push({ q: item.question.slice(0, 40), err: "임베딩 실패: " + e.message });
      }
    } catch (e) {
      failed++;
      errors.push({ q: item.question.slice(0, 40), err: e.message });
    }
  }

  return Response.json({
    ok: true,
    batch: batchId,
    batch_name: batch.name,
    total_in_batch: batch.data.length,
    inserted,
    skipped,
    embedded,
    failed,
    errors: errors.slice(0, 10),
  });
}
