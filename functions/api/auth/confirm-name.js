// 본명 확인 (카톡 로그인 직후 1회)
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: "로그인 필요" }, { status: 401 });

  try {
    const session = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(match[1]).first();
    if (!session) return Response.json({ error: "세션 만료" }, { status: 401 });

    const body = await context.request.json();
    const realName = (body.real_name || "").trim();

    // 간단 검증: 2~20자, 한글/영문만
    if (!realName || realName.length < 2 || realName.length > 20) {
      return Response.json({ error: "2~20자 이내로 입력해 주세요." }, { status: 400 });
    }
    if (!/^[가-힣a-zA-Z\s]+$/.test(realName)) {
      return Response.json({ error: "한글 또는 영문 이름만 입력 가능합니다." }, { status: 400 });
    }

    await db.prepare(
      `UPDATE users SET real_name = ?, name_confirmed = 1 WHERE id = ?`
    ).bind(realName, session.user_id).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
