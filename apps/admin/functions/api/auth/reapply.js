// 거절된 사용자가 재신청 (rejected → pending)
// Rate limit: 하루 1회
const reapplyMap = new Map();

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: "로그인 필요" }, { status: 401 });

  try {
    const session = await db.prepare(
      `SELECT s.user_id, u.approval_status, u.approved_at FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).bind(match[1]).first();
    if (!session) return Response.json({ error: "세션 만료" }, { status: 401 });

    if (session.approval_status !== 'rejected') {
      return Response.json({ error: "거절된 계정이 아닙니다" }, { status: 400 });
    }

    // 1일 1회 제한
    const now = Date.now();
    const last = reapplyMap.get(session.user_id);
    if (last && now - last < 24 * 60 * 60 * 1000) {
      return Response.json({ error: "하루 1회만 재신청 가능합니다. 내일 다시 시도해 주세요." }, { status: 429 });
    }

    // pending으로 복귀
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    await db.prepare(
      `UPDATE users SET approval_status = 'pending', rejection_reason = NULL, approved_at = NULL, approved_by = NULL WHERE id = ?`
    ).bind(session.user_id).run();

    reapplyMap.set(session.user_id, now);

    return Response.json({ ok: true, message: "재신청 완료. 세무사 검토 후 연락드립니다." });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
