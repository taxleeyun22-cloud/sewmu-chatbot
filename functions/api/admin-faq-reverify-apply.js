// Claude 2차 재검증 결과(_faq-reverify-v1.js) 를 D1 에 일괄 적용
// 내용 수정(new_answer/new_law_refs) + 상태 변경 + delete(active=0) 지원
// 수정 시 자동 재임베딩.

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";
import { embed, ensureFaqsTable } from "./_rag.js";
import { REVERIFY_V1 } from "./_faq-reverify-v1.js";

function kst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();
  return Response.json({ total: REVERIFY_V1.length, items: REVERIFY_V1 });
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 없음" }, { status: 500 });
  await ensureFaqsTable(db);

  const now = kst();
  let verified_count = 0, content_updated = 0, deleted = 0, reembedded = 0, skipped = 0;
  const missing = [];

  for (const r of REVERIFY_V1) {
    const row = await db.prepare(
      `SELECT id, question, answer, law_refs FROM faqs WHERE q_number = ? LIMIT 1`
    ).bind(r.q).first();
    if (!row) { missing.push(r.q); skipped++; continue; }

    try {
      // 1) 내용 수정 (new_answer 또는 new_law_refs 있으면)
      let contentChanged = false;
      const newAnswer = r.new_answer || row.answer;
      const newLawRefs = r.new_law_refs !== undefined ? r.new_law_refs : row.law_refs;
      if (r.new_answer || r.new_law_refs !== undefined) {
        await db.prepare(
          `UPDATE faqs SET answer = ?, law_refs = ?, updated_at = ? WHERE id = ?`
        ).bind(newAnswer, newLawRefs, now, row.id).run();
        content_updated++;
        contentChanged = true;
      }

      // 2) 삭제(active=0) 처리
      if (r.delete) {
        await db.prepare(`UPDATE faqs SET active = 0, updated_at = ? WHERE id = ?`)
          .bind(now, row.id).run();
        deleted++;
      }

      // 3) 상태 업데이트
      await db.prepare(
        `UPDATE faqs SET verified_status = ?, verified_note = ?, verified_at = ? WHERE id = ?`
      ).bind(r.new_status, r.note || null, now, row.id).run();
      if (r.new_status === "verified") verified_count++;

      // 4) 내용 바뀌었으면 재임베딩
      if (contentChanged && !r.delete) {
        try {
          const vec = await embed(`${row.question}\n${newAnswer}`, context.env);
          if (vec) {
            await db.prepare(`UPDATE faqs SET embedding = ? WHERE id = ?`)
              .bind(JSON.stringify(vec), row.id).run();
            reembedded++;
          }
        } catch {}
      }
    } catch (e) {
      skipped++;
    }
  }

  return Response.json({
    ok: true,
    total_in_report: REVERIFY_V1.length,
    verified_count,
    content_updated,
    reembedded,
    deleted,
    skipped,
    missing_q: missing,
  });
}
