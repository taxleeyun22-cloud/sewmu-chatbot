// 관리자 검증 탭: 신뢰도 보통/낮음/신고된 답변 조회 + 검토완료 처리
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const adminKey = context.env.ADMIN_KEY;
  if (!adminKey || key !== adminKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  // 컬럼 보장
  try { await db.prepare(`ALTER TABLE conversations ADD COLUMN confidence TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reviewed INTEGER DEFAULT 0`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reported INTEGER DEFAULT 0`).run(); } catch {}

  const filter = url.searchParams.get("filter") || "pending"; // pending/low/medium/reported/all

  let whereClause = "";
  if (filter === "pending") {
    whereClause = "(c.confidence IN ('보통','낮음') OR c.reported = 1) AND (c.reviewed = 0 OR c.reviewed IS NULL)";
  } else if (filter === "low") {
    whereClause = "c.confidence = '낮음' AND (c.reviewed = 0 OR c.reviewed IS NULL)";
  } else if (filter === "medium") {
    whereClause = "c.confidence = '보통' AND (c.reviewed = 0 OR c.reviewed IS NULL)";
  } else if (filter === "reported") {
    whereClause = "c.reported = 1 AND (c.reviewed = 0 OR c.reviewed IS NULL)";
  } else {
    whereClause = "c.role = 'assistant'";
  }
  if (!whereClause.includes("c.role")) whereClause = "c.role = 'assistant' AND " + whereClause;

  try {
    const { results } = await db.prepare(`
      SELECT
        c.id, c.session_id, c.user_id, c.created_at, c.content,
        c.confidence, c.reviewed, c.reported,
        u.name as user_name, u.profile_image as user_image, u.provider,
        (SELECT content FROM conversations prev
          WHERE prev.session_id = c.session_id
            AND prev.role = 'user'
            AND prev.created_at < c.created_at
          ORDER BY prev.created_at DESC
          LIMIT 1) as question
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT 50
    `).all();

    return Response.json({ items: results || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// 검토 완료 / 신고 / 해제 처리
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const adminKey = context.env.ADMIN_KEY;
  if (!adminKey || key !== adminKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  try {
    const body = await context.request.json();
    const action = body.action;
    const id = body.id;

    // 일괄 처리 액션은 id 불필요
    const bulkActions = ["bulk_review_all_reported", "bulk_review_pending"];
    const isBulk = bulkActions.includes(action);

    if (!isBulk && !id) {
      return Response.json({ error: "id required" }, { status: 400 });
    }

    if (action === "mark_reviewed") {
      await db.prepare(`UPDATE conversations SET reviewed = 1 WHERE id = ?`).bind(id).run();
    } else if (action === "report") {
      await db.prepare(`UPDATE conversations SET reported = 1 WHERE id = ?`).bind(id).run();
    } else if (action === "unreport") {
      await db.prepare(`UPDATE conversations SET reported = 0 WHERE id = ?`).bind(id).run();
    } else if (action === "report_and_review") {
      await db.prepare(`UPDATE conversations SET reported = 1, reviewed = 1 WHERE id = ?`).bind(id).run();
    } else if (action === "bulk_review_all_reported") {
      // 신고된(reported=1) 전체 일괄 처리완료
      const r = await db.prepare(
        `UPDATE conversations SET reviewed = 1 WHERE reported = 1 AND (reviewed = 0 OR reviewed IS NULL)`
      ).run();
      return Response.json({ ok: true, updated: r.meta?.changes || 0 });
    } else if (action === "bulk_review_pending") {
      // 검증 대기(신뢰도 보통/낮음 or 신고) 전체 일괄 처리완료
      const r = await db.prepare(
        `UPDATE conversations SET reviewed = 1 WHERE role = 'assistant' AND (confidence IN ('보통','낮음') OR reported = 1) AND (reviewed = 0 OR reviewed IS NULL)`
      ).run();
      return Response.json({ ok: true, updated: r.meta?.changes || 0 });
    } else {
      return Response.json({ error: "unknown action" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
