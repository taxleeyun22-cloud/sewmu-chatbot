// FAQ CRUD 엔드포인트 (owner 전용)
// - GET  /api/admin-faq : 전체 목록 (q_number ASC)
// - GET  /api/admin-faq?id=X : 단일 조회
// - POST /api/admin-faq?action=create : { q_number?, category, question, answer, law_refs? }
// - POST /api/admin-faq?action=update : { id, question, answer, law_refs, category, active? }
// - POST /api/admin-faq?action=delete : { id }
// - POST /api/admin-faq?action=reembed_all : 전체 재임베딩 (모델 변경 시)

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";
import { checkRole, roleForbidden } from "./_authz.js";
import { ensureFaqsTable, embed } from "./_rag.js";

function kst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 없음" }, { status: 500 });

  await ensureFaqsTable(db);
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const search = (url.searchParams.get("search") || "").trim();
  const category = url.searchParams.get("category") || "";

  try {
    if (id) {
      const row = await db.prepare(
        `SELECT id, q_number, category, question, answer, law_refs, active, created_at, updated_at,
                verified_status, verified_note, verified_at,
                CASE WHEN embedding IS NULL THEN 0 ELSE 1 END as has_embedding
         FROM faqs WHERE id = ?`
      ).bind(id).first();
      if (!row) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ faq: row });
    }

    const verified = url.searchParams.get("verified") || "";

    let where = "1=1";
    const binds = [];
    if (search) {
      where += ` AND (question LIKE ? OR answer LIKE ? OR law_refs LIKE ?)`;
      const p = `%${search}%`;
      binds.push(p, p, p);
    }
    if (category && category !== "all") {
      where += ` AND category = ?`;
      binds.push(category);
    }
    if (verified && verified !== "all") {
      // 'unchecked' 은 NULL 도 포함
      if (verified === "unchecked") {
        where += ` AND (verified_status IS NULL OR verified_status = 'unchecked')`;
      } else {
        where += ` AND verified_status = ?`;
        binds.push(verified);
      }
    }

    const { results } = await db.prepare(`
      SELECT id, q_number, category, question, answer, law_refs, active, updated_at,
             verified_status, verified_note,
             CASE WHEN embedding IS NULL THEN 0 ELSE 1 END as has_embedding
      FROM faqs
      WHERE ${where}
      ORDER BY q_number ASC, id ASC
      LIMIT 500
    `).bind(...binds).all();

    // 카테고리별 카운트
    const { results: catResults } = await db.prepare(
      `SELECT category, COUNT(*) as n FROM faqs WHERE active = 1 GROUP BY category ORDER BY n DESC`
    ).all();

    // 검증 상태별 카운트
    const vu = await db.prepare(`SELECT COUNT(*) as n FROM faqs WHERE verified_status IS NULL OR verified_status = 'unchecked'`).first();
    const vv = await db.prepare(`SELECT COUNT(*) as n FROM faqs WHERE verified_status = 'verified'`).first();
    const vs = await db.prepare(`SELECT COUNT(*) as n FROM faqs WHERE verified_status = 'suspicious'`).first();
    const vw = await db.prepare(`SELECT COUNT(*) as n FROM faqs WHERE verified_status = 'wrong'`).first();

    return Response.json({
      faqs: results || [],
      categories: catResults || [],
      total: (results || []).length,
      verified_counts: {
        unchecked: vu?.n || 0,
        verified: vv?.n || 0,
        suspicious: vs?.n || 0,
        wrong: vw?.n || 0,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 없음" }, { status: 500 });

  await ensureFaqsTable(db);
  const url = new URL(context.request.url);
  const action = url.searchParams.get("action");
  const now = kst();

  let body = {};
  try { body = await context.request.json(); } catch {}

  try {
    if (action === "create") {
      const question = (body.question || "").trim();
      const answer = (body.answer || "").trim();
      const category = (body.category || "기타").trim();
      const law_refs = (body.law_refs || "").trim() || null;
      let q_number = Number(body.q_number) || null;

      if (!question || !answer) {
        return Response.json({ error: "제목과 답변을 입력해 주세요" }, { status: 400 });
      }
      if (question.length > 200) return Response.json({ error: "제목이 너무 깁니다 (200자)" }, { status: 400 });
      if (answer.length > 10000) return Response.json({ error: "답변이 너무 깁니다 (10000자)" }, { status: 400 });

      // q_number 미지정 시 최대+1
      if (!q_number) {
        const maxR = await db.prepare(`SELECT COALESCE(MAX(q_number), 0) as m FROM faqs`).first();
        q_number = (maxR?.m || 0) + 1;
      }

      const r = await db.prepare(
        `INSERT INTO faqs (q_number, category, question, answer, law_refs, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(q_number, category, question, answer, law_refs, now, now).run();
      const id = r.meta.last_row_id;

      // 임베딩 생성
      try {
        const vec = await embed(`${question}\n${answer}`, context.env);
        if (vec) {
          await db.prepare(`UPDATE faqs SET embedding = ? WHERE id = ?`)
            .bind(JSON.stringify(vec), id).run();
        }
      } catch (e) {
        return Response.json({ ok: true, id, q_number, warning: "임베딩 실패: " + e.message });
      }

      return Response.json({ ok: true, id, q_number });
    }

    if (action === "update") {
      const id = Number(body.id);
      if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
      const old = await db.prepare(`SELECT question, answer, embedding FROM faqs WHERE id = ?`).bind(id).first();
      if (!old) return Response.json({ error: "FAQ 없음" }, { status: 404 });

      const question = (body.question || "").trim();
      const answer = (body.answer || "").trim();
      const category = (body.category || "기타").trim();
      const law_refs = (body.law_refs || "").trim() || null;
      const active = body.active === 0 || body.active === false ? 0 : 1;

      if (!question || !answer) return Response.json({ error: "제목과 답변을 입력해 주세요" }, { status: 400 });

      await db.prepare(
        `UPDATE faqs SET question = ?, answer = ?, category = ?, law_refs = ?, active = ?, updated_at = ? WHERE id = ?`
      ).bind(question, answer, category, law_refs, active, now, id).run();

      // 재임베딩 조건: 질문/답변 변경됐거나 기존 임베딩이 없으면 무조건 생성
      const contentChanged = old.question !== question || old.answer !== answer;
      const needsEmbedding = contentChanged || !old.embedding;
      if (needsEmbedding) {
        try {
          const vec = await embed(`${question}\n${answer}`, context.env);
          if (vec) {
            await db.prepare(`UPDATE faqs SET embedding = ? WHERE id = ?`)
              .bind(JSON.stringify(vec), id).run();
          } else {
            return Response.json({ ok: true, warning: "임베딩 API 응답 비어있음" });
          }
        } catch (e) {
          return Response.json({ ok: true, warning: "재임베딩 실패: " + e.message });
        }
      }

      return Response.json({ ok: true, reembedded: needsEmbedding });
    }

    if (action === "delete") {
      /* Phase #10 적용 (2026-05-06): FAQ 삭제 = manager+ 전용 (영구 삭제, 위험). */
      const authz = await checkRole(context, 'manager');
      if (!authz.ok) return roleForbidden(authz);
      const id = Number(body.id);
      if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
      await db.prepare(`DELETE FROM faqs WHERE id = ?`).bind(id).run();
      return Response.json({ ok: true });
    }

    // 검증 상태 업데이트 (개별)
    if (action === "set_verified") {
      const id = Number(body.id);
      const status = body.status;  // 'verified' | 'suspicious' | 'wrong' | 'unchecked'
      const note = (body.note || "").trim() || null;
      if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
      if (!["verified", "suspicious", "wrong", "unchecked"].includes(status)) {
        return Response.json({ error: "status는 verified/suspicious/wrong/unchecked 중 하나" }, { status: 400 });
      }
      await db.prepare(
        `UPDATE faqs SET verified_status = ?, verified_note = ?, verified_at = ? WHERE id = ?`
      ).bind(status, note, now, id).run();
      return Response.json({ ok: true });
    }

    // 검증 상태 일괄 업데이트 (Claude가 삼중체크 결과 업로드용)
    if (action === "bulk_verify") {
      const items = Array.isArray(body.items) ? body.items : [];
      let updated = 0, skipped = 0;
      for (const it of items) {
        if (!it.id || !["verified", "suspicious", "wrong", "unchecked"].includes(it.status)) { skipped++; continue; }
        try {
          await db.prepare(
            `UPDATE faqs SET verified_status = ?, verified_note = ?, verified_at = ? WHERE id = ?`
          ).bind(it.status, it.note || null, now, Number(it.id)).run();
          updated++;
        } catch { skipped++; }
      }
      return Response.json({ ok: true, updated, skipped });
    }

    if (action === "reembed_all") {
      const { results } = await db.prepare(`SELECT id, question, answer FROM faqs WHERE active = 1`).all();
      let ok = 0, fail = 0;
      for (const row of (results || [])) {
        try {
          const vec = await embed(`${row.question}\n${row.answer}`, context.env);
          if (vec) {
            await db.prepare(`UPDATE faqs SET embedding = ?, updated_at = ? WHERE id = ?`)
              .bind(JSON.stringify(vec), now, row.id).run();
            ok++;
          } else fail++;
        } catch { fail++; }
      }
      return Response.json({ ok: true, reembedded: ok, failed: fail });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
