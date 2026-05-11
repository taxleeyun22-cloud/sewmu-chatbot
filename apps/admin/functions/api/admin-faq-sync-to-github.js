// 의심(suspicious)·틀림(wrong) 상태의 FAQ를 GitHub 레포에 JSON으로 동기화
// Claude가 세션에서 flagged-faqs.json 읽고 수정 처리 가능하도록
//
// POST /api/admin-faq-sync-to-github?key=ADMIN_KEY
// 응답: { ok, total, github_url }

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  const ghToken = context.env.GITHUB_TOKEN;
  if (!ghToken) return Response.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });

  const owner = "taxleeyun22-cloud";
  const repo = "sewmu-chatbot";
  const filePath = "flagged-faqs.json";
  const branch = "main";

  try {
    // verified_status = suspicious | wrong 인 FAQ 전체 추출
    const { results } = await db.prepare(`
      SELECT id, q_number, category, question, answer, law_refs,
             verified_status, verified_note, updated_at
      FROM faqs
      WHERE verified_status IN ('suspicious', 'wrong')
        AND active = 1
      ORDER BY verified_status DESC, q_number ASC
      LIMIT 500
    `).all();

    const items = (results || []).map(r => ({
      id: r.id,
      q_number: r.q_number,
      category: r.category,
      question: r.question,
      answer: r.answer,
      law_refs: r.law_refs,
      status: r.verified_status,
      note: r.verified_note,
      last_updated: r.updated_at,
    }));

    const exportData = {
      exported_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19),
      total: items.length,
      items,
      instructions: [
        "이 파일의 각 FAQ를 재검증 후 수정 처리해주세요.",
        "1. 각 아이템의 question·answer·law_refs를 법령(국가법령정보센터) 기준 재확인",
        "2. status='wrong' 은 명백히 틀린 것 → 삭제 또는 올바른 내용으로 교체",
        "3. status='suspicious' 는 민감한 숫자·시점 → 최신 법령·국세청 고시로 확정",
        "4. 수정 완료 시 /api/admin-faq?action=update 로 DB 반영 (자동 재임베딩)",
        "5. 재검증 후 상태를 'verified' 로 변경 (/api/admin-faq?action=set_verified)",
        "6. 처리 완료 항목은 이 파일에서 제거 또는 전체 파일 삭제",
      ].join("\n"),
    };

    const content = JSON.stringify(exportData, null, 2);
    const contentB64 = btoa(unescape(encodeURIComponent(content)));

    // 기존 파일 SHA 조회
    let sha = null;
    try {
      const getRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        { headers: { Authorization: `Bearer ${ghToken}`, "User-Agent": "sewmu-chatbot" } }
      );
      if (getRes.ok) {
        const getData = await getRes.json();
        sha = getData.sha;
      }
    } catch {}

    const putBody = {
      message: `flagged-faqs.json 동기화 (${items.length}건)`,
      content: contentB64,
      branch,
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          "Content-Type": "application/json",
          "User-Agent": "sewmu-chatbot",
        },
        body: JSON.stringify(putBody),
      }
    );
    if (!putRes.ok) {
      const err = await putRes.text();
      return Response.json({ error: "GitHub 업로드 실패: " + err }, { status: 500 });
    }

    return Response.json({
      ok: true,
      total: items.length,
      github_url: `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestGet(context) {
  return onRequestPost(context);
}
