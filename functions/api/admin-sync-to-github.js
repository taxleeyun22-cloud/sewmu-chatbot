// 검증 필요 데이터를 GitHub 레포에 JSON 파일로 동기화
// Claude가 MCP로 읽어서 자동 처리할 수 있도록
import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

export async function onRequestPost(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  const ghToken = context.env.GITHUB_TOKEN;
  if (!ghToken) return Response.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });

  const owner = "taxleeyun22-cloud";
  const repo = "sewmu-chatbot";
  const filePath = "flagged-items.json";
  const branch = "main";

  try {
    // 1. 검증 필요 답변 전체 조회
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN confidence TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reviewed INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reported INTEGER DEFAULT 0`).run(); } catch {}

    const { results } = await db.prepare(`
      SELECT
        c.id, c.session_id, c.user_id, c.created_at, c.content,
        c.confidence, c.reviewed, c.reported,
        u.name as user_name, u.provider,
        (SELECT content FROM conversations prev
          WHERE prev.session_id = c.session_id
            AND prev.role = 'user'
            AND prev.created_at < c.created_at
          ORDER BY prev.created_at DESC
          LIMIT 1) as question
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.role = 'assistant'
        AND (c.confidence IN ('보통','낮음') OR c.reported = 1)
        AND (c.reviewed = 0 OR c.reviewed IS NULL)
      ORDER BY c.created_at DESC
      LIMIT 200
    `).all();

    const items = (results || []).map(r => ({
      id: r.id,
      created_at: r.created_at,
      user_name: r.user_name || "비로그인",
      provider: r.provider,
      confidence: r.confidence,
      reported: !!r.reported,
      question: r.question,
      answer: r.content,
    }));

    const exportData = {
      exported_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19),
      total: items.length,
      items,
      instructions: "이 파일의 각 아이템을 검토 후, 틀린 내용은 functions/api/chat.js의 FAQ 섹션에 하드코딩을 추가하고, 처리된 id는 /api/admin-review로 reviewed=1 처리해주세요."
    };

    const content = JSON.stringify(exportData, null, 2);
    const contentB64 = btoa(unescape(encodeURIComponent(content)));

    // 2. 기존 파일 SHA 조회 (있으면 업데이트, 없으면 생성)
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

    // 3. 파일 업데이트 또는 생성
    const putBody = {
      message: `flagged-items.json 동기화 (${items.length}건)`,
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

    return Response.json({ ok: true, total: items.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestGet(context) {
  return onRequestPost(context);
}
