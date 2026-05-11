// 로그인 사용자의 기본 정보(본명·전화) 수정
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
    const phoneRaw = (body.phone || "").trim();

    // 전화번호 정규화
    const digits = phoneRaw.replace(/\D/g, "");
    let phone = "";
    if (digits.length === 11 && digits.startsWith("010")) {
      phone = `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
      phone = `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    }

    // 검증
    if (!realName || realName.length < 2 || realName.length > 20) {
      return Response.json({ error: "이름을 2~20자로 입력해 주세요." }, { status: 400 });
    }
    if (!/^[가-힣a-zA-Z\s]+$/.test(realName)) {
      return Response.json({ error: "한글 또는 영문 이름만 입력 가능합니다." }, { status: 400 });
    }
    if (!phone) {
      return Response.json({ error: "올바른 휴대폰 번호를 입력해 주세요." }, { status: 400 });
    }

    await db.prepare(
      `UPDATE users SET real_name = ?, phone = ? WHERE id = ?`
    ).bind(realName, phone, session.user_id).run();

    return Response.json({ ok: true, real_name: realName, phone });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
