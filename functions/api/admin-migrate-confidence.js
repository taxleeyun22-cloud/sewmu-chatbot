// 기존 대화에서 [신뢰도: X] 파싱해서 confidence 컬럼 채우기 (1회성 마이그레이션)
import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

export async function onRequestPost(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  try {
    // 컬럼 보장
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN confidence TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reviewed INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reported INTEGER DEFAULT 0`).run(); } catch {}

    // confidence가 NULL인 assistant 답변 모두 가져옴
    const { results } = await db.prepare(`
      SELECT id, content FROM conversations
      WHERE role = 'assistant' AND confidence IS NULL
    `).all();

    let updated = 0;
    const stats = { high: 0, medium: 0, low: 0, none: 0 };

    for (const row of results || []) {
      const m = String(row.content || "").match(/\[신뢰도:\s*(높음|보통|낮음)(?:[^\]]*)?\]/);
      if (m) {
        const conf = m[1];
        await db.prepare(`UPDATE conversations SET confidence = ? WHERE id = ?`).bind(conf, row.id).run();
        updated++;
        if (conf === "높음") stats.high++;
        else if (conf === "보통") stats.medium++;
        else if (conf === "낮음") stats.low++;
      } else {
        stats.none++;
      }
    }

    return Response.json({
      ok: true,
      total_checked: (results || []).length,
      updated,
      stats,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// GET으로도 간단히 실행 가능하게 (편의)
export async function onRequestGet(context) {
  return onRequestPost(context);
}
